import {
  ATTENDANCE_LABELS,
  ATTENDANCE_STATUSES,
  type AttendanceQrDTO,
  type AttendanceSessionDetailDTO,
  type AttendanceStatus,
  type AttendanceUpdateEvent,
  campusClock,
  formatClock,
  formatShortDate,
  type RosterEntryDTO,
} from '@cui/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ClipboardCheck, Expand, Lock, QrCode, RotateCcw, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { type CSSProperties, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { EmptyState, Spinner } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useAction } from '@/hooks/useSubmit';
import { ApiError, api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { getSocket } from '@/lib/socket';
import { cn } from '@/lib/utils';

const SHORT: Record<AttendanceStatus, string> = {
  present: 'P',
  late: 'L',
  absent: 'A',
  leave: 'Lv',
};

const ACTIVE: Record<AttendanceStatus, string> = {
  present: 'border-primary bg-primary text-primary-foreground',
  late: 'border-warning bg-warning text-white',
  absent: 'border-danger bg-danger text-white',
  leave: 'border-border-strong bg-muted-foreground text-white',
};

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Karachi',
});

/** Fetches a fresh code at the start of every window, for as long as the session is open. */
function useRotatingCode(sessionId: string, enabled: boolean) {
  const [code, setCode] = useState<(AttendanceQrDTO & { fetchedAt: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) {
      setCode(null);
      return;
    }
    let timer: number | undefined;
    let stopped = false;
    const load = async () => {
      try {
        const next = await api.teaching.qr(sessionId);
        if (stopped) return;
        setCode({ ...next, fetchedAt: Date.now() });
        setError(null);
        timer = window.setTimeout(load, Math.max(250, next.remainingMs + 150));
      } catch (err) {
        if (stopped) return;
        setError(err instanceof ApiError ? err.message : 'Cannot reach the server.');
        timer = window.setTimeout(load, 3000);
      }
    };
    void load();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [sessionId, enabled]);
  return { code, error };
}

/** Applies live check-ins from the socket to the cached session. */
function useLiveRoster(sessionId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const socket = getSocket();
    const key = keys.attendanceSession(sessionId);
    const onUpdate = (event: AttendanceUpdateEvent) => {
      if (event.sessionId !== sessionId) return;
      qc.setQueryData<AttendanceSessionDetailDTO>(key, (data) => {
        if (!data) return data;
        const { entry } = event;
        return {
          ...data,
          session: { ...data.session, counts: event.counts, status: event.status },
          roster: entry
            ? data.roster.map((r) => (r.student.id === entry.student.id ? entry : r))
            : data.roster,
        };
      });
      // Closing marks everyone left absent: reload the whole roster.
      if (!event.entry) void qc.invalidateQueries({ queryKey: key });
    };
    socket.on('attendance:update', onUpdate);
    return () => {
      socket.off('attendance:update', onUpdate);
    };
  }, [qc, sessionId]);
}

function CodePanel({
  code,
  error,
  checkedIn,
  enrolled,
  big,
}: {
  code: ReturnType<typeof useRotatingCode>['code'];
  error: string | null;
  checkedIn: number;
  enrolled: number;
  big?: boolean;
}) {
  const url = code ? `${window.location.origin}${code.path}` : '';
  return (
    <figure
      className="flex flex-col items-center gap-3"
      data-testid="attendance-qr"
      data-checkin-path={code?.path ?? ''}
    >
      <div
        className={cn(
          'rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/10',
          big ? 'size-[min(70vh,80vw)]' : 'size-[268px]',
        )}
      >
        {code ? (
          <QRCodeSVG
            value={url}
            level="M"
            marginSize={0}
            className="size-full"
            title="Scan to check in"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            {error ? <QrCode className="size-10" aria-hidden /> : <Spinner />}
          </div>
        )}
      </div>
      {code && (
        <div className="h-1 w-full max-w-[268px] overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            key={code.token}
            className="h-full rounded-full bg-primary"
            style={
              {
                '--qr-from': `${Math.min(100, (code.remainingMs / (code.windowSeconds * 1000)) * 100)}%`,
                animation: `qr-countdown ${code.remainingMs}ms linear forwards`,
              } as CSSProperties
            }
          />
        </div>
      )}
      <figcaption className={cn('text-center', big ? 'text-[22px]' : 'text-[13.5px]')}>
        {error ? (
          <span className="text-danger">{error}</span>
        ) : (
          <>
            <span className="font-semibold">Scan with your phone camera to check in.</span>{' '}
            <span className="text-muted-foreground">
              The code changes every {code?.windowSeconds ?? 10} seconds.
            </span>
          </>
        )}
        <span
          className={cn(
            'mt-1 block font-bold tabular-nums',
            big ? 'text-[40px]' : 'text-[20px] text-primary dark:text-link',
          )}
          aria-live="polite"
        >
          {checkedIn} / {enrolled} checked in
        </span>
      </figcaption>
    </figure>
  );
}

function RosterRow({
  entry,
  editable,
  onMark,
  pending,
}: {
  entry: RosterEntryDTO;
  editable: boolean;
  onMark: (status: AttendanceStatus | null) => void;
  pending: boolean;
}) {
  const recent = entry.markedAt && Date.now() - new Date(entry.markedAt).getTime() < 6000;
  const how =
    entry.method === 'qr'
      ? `Scanned ${timeFormat.format(new Date(entry.markedAt ?? Date.now()))}`
      : entry.method === 'manual'
        ? 'Marked by teacher'
        : entry.method === 'auto'
          ? 'Not checked in'
          : 'Not marked yet';
  return (
    <li
      className={cn(
        'flex items-center gap-3 px-4 py-2 transition-colors',
        recent && entry.method === 'qr' && 'bg-primary-soft',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">{entry.student.name}</span>
        <span className="block truncate text-[12px] text-muted-foreground">
          {entry.student.regNo} · {how}
        </span>
      </span>
      <fieldset
        className="flex shrink-0 gap-1"
        aria-label={`Attendance for ${entry.student.name}`}
        disabled={!editable || pending}
      >
        {ATTENDANCE_STATUSES.map((status) => {
          const active = entry.status === status;
          return (
            <button
              key={status}
              type="button"
              aria-pressed={active}
              title={ATTENDANCE_LABELS[status]}
              aria-label={`${ATTENDANCE_LABELS[status]}: ${entry.student.name}`}
              onClick={() => onMark(active ? null : status)}
              className={cn(
                'h-7 min-w-8 rounded-md border px-1.5 text-[12px] font-bold transition-colors disabled:cursor-not-allowed',
                active
                  ? ACTIVE[status]
                  : 'border-border-strong bg-surface text-muted-foreground hover:bg-muted',
              )}
            >
              {SHORT[status]}
            </button>
          );
        })}
      </fieldset>
    </li>
  );
}

/** The teacher's live view of one class: the QR code, who has checked in, and the roll. */
export default function AttendanceSessionPage() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const key = keys.attendanceSession(sessionId);
  const detail = useQuery({
    queryKey: key,
    queryFn: () => api.teaching.session(sessionId),
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
  });
  useLiveRoster(sessionId);
  const [presenting, setPresenting] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const data = detail.data;
  const isToday = data?.session.date === campusClock().date;
  const showCode = !!data?.canManage && data.session.status === 'open' && isToday;
  const { code, error } = useRotatingCode(sessionId, showCode);

  const mark = useAction(
    ({ studentId, status }: { studentId: string; status: AttendanceStatus | null }) =>
      api.teaching.mark(sessionId, studentId, status),
  );
  const close = useAction(() => api.teaching.closeSession(sessionId), {
    done: 'Attendance closed. Students who did not check in are marked absent.',
    invalidate: [key, keys.teachingCourses, ['teaching', 'sheet']],
  });
  const reopen = useAction(
    () =>
      api.teaching.startAttendance({
        offeringId: data?.session.course.offeringId ?? '',
        date: data?.session.date,
      }),
    { invalidate: [keys.teachingCourses] },
  );

  useEffect(() => {
    if (!presenting) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPresenting(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [presenting]);

  const back = (
    <Link
      to="/academics/attendance"
      className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden /> Attendance
    </Link>
  );
  if (detail.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (!data) {
    return (
      <>
        {back}
        <EmptyState icon={ClipboardCheck} title="Attendance session not found">
          {detail.error instanceof ApiError ? detail.error.message : 'Try again in a moment.'}
        </EmptyState>
      </>
    );
  }

  const { session, roster } = data;
  const { counts } = session;
  const checkedIn = counts.present + counts.late;
  const open = session.status === 'open';

  return (
    <>
      {back}
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] leading-tight font-bold tracking-tight">
            {session.course.code} {session.course.title}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[14px] text-muted-foreground">
            {session.course.sectionName} · {formatShortDate(session.date)}
            {session.start ? ` · ${formatClock(session.start)}` : ''}
            {open ? (
              <Badge tone="primary">Open</Badge>
            ) : (
              <Badge>
                <Lock /> Closed
              </Badge>
            )}
          </p>
        </div>
        {data.canManage && (
          <div className="flex flex-wrap gap-2">
            {showCode && (
              <Button variant="outline" onClick={() => setPresenting(true)}>
                <Expand /> Show full screen
              </Button>
            )}
            {open ? (
              <Button onClick={() => setConfirmClose(true)}>
                <Lock /> Close attendance
              </Button>
            ) : (
              isToday && (
                <Button
                  variant="outline"
                  loading={reopen.isPending}
                  onClick={() =>
                    reopen.mutate(undefined, {
                      onSuccess: (d) => {
                        qc.setQueryData(key, d);
                        navigate(`/academics/attendance/session/${d.session.id}`, {
                          replace: true,
                        });
                      },
                    })
                  }
                >
                  <RotateCcw /> Reopen
                </Button>
              )
            )}
          </div>
        )}
      </header>

      <div className={cn('grid gap-5', showCode && 'lg:grid-cols-[320px_minmax(0,1fr)]')}>
        {showCode && (
          <section className="h-fit rounded-lg border bg-surface p-5">
            <CodePanel code={code} error={error} checkedIn={checkedIn} enrolled={counts.enrolled} />
          </section>
        )}

        <section className="min-w-0 overflow-hidden rounded-lg border bg-surface">
          <div className="grid grid-cols-5 divide-x border-b text-center">
            {(
              [
                ['Present', counts.present, 'text-primary dark:text-link'],
                ['Late', counts.late, 'text-warning'],
                ['Absent', counts.absent, 'text-danger'],
                ['Leave', counts.leave, ''],
                ['Not marked', counts.unmarked, 'text-muted-foreground'],
              ] as const
            ).map(([label, value, tone]) => (
              <div key={label} className="px-2 py-2.5">
                <p className={cn('text-[20px] leading-tight font-bold tabular-nums', tone)}>
                  {value}
                </p>
                <p className="text-[11.5px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
          {!open && data.canManage && (
            <p className="border-b bg-surface-2 px-4 py-2 text-[12.5px] text-muted-foreground">
              This class is closed. You can still correct any mark; students are told if it changes
              their standing.
            </p>
          )}
          <ul aria-label="Roster" className="divide-y">
            {roster.map((entry) => (
              <RosterRow
                key={entry.student.id}
                entry={entry}
                editable={data.canManage}
                pending={mark.isPending && mark.variables?.studentId === entry.student.id}
                onMark={(status) => mark.mutate({ studentId: entry.student.id, status })}
              />
            ))}
          </ul>
        </section>
      </div>

      {presenting && showCode && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Attendance code"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background p-6"
        >
          <Button
            variant="outline"
            size="icon"
            aria-label="Exit full screen"
            className="absolute top-4 right-4"
            onClick={() => setPresenting(false)}
          >
            <X />
          </Button>
          <p className="text-[24px] font-bold">
            {session.course.code} {session.course.title} · {session.course.sectionName}
          </p>
          <CodePanel
            code={code}
            error={error}
            checkedIn={checkedIn}
            enrolled={counts.enrolled}
            big
          />
        </div>
      )}

      <Dialog open={confirmClose} onOpenChange={setConfirmClose}>
        <DialogContent
          title="Close attendance?"
          description={`${counts.unmarked} student${counts.unmarked === 1 ? '' : 's'} not marked yet will be recorded absent. You can still correct marks afterwards.`}
        >
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmClose(false)}>
              Keep open
            </Button>
            <Button
              loading={close.isPending}
              onClick={() => close.mutate(undefined, { onSuccess: () => setConfirmClose(false) })}
            >
              Close attendance
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
