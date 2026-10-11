import { ATTENDANCE_LABELS, type AttendanceStatus, formatShortDate } from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ClipboardCheck } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router';
import { EmptyState, Spinner } from '@/components/feedback';
import { PageHeader } from '@/components/page';
import { ApiError, api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { cn } from '@/lib/utils';

const CELL: Record<AttendanceStatus, { text: string; className: string }> = {
  present: { text: 'P', className: 'text-primary dark:text-link' },
  late: { text: 'L', className: 'bg-warning-soft text-warning' },
  absent: { text: 'A', className: 'bg-danger-soft text-danger' },
  leave: { text: 'Lv', className: 'text-muted-foreground' },
};

/** A course's whole attendance register: one row per student, one column per class. */
export default function AttendanceSheetPage() {
  const { offeringId = '' } = useParams();
  const scroller = useRef<HTMLDivElement>(null);
  const sheet = useQuery({
    queryKey: keys.attendanceSheet(offeringId),
    queryFn: () => api.teaching.attendanceSheet(offeringId),
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
  });
  const columns = sheet.data?.sessions.length ?? 0;
  // Open on the most recent classes (the right end of the register).
  useEffect(() => {
    const el = scroller.current;
    if (el && columns) el.scrollLeft = el.scrollWidth;
  }, [columns]);

  const back = (
    <Link
      to="/academics/attendance"
      className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden /> Attendance
    </Link>
  );
  if (sheet.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (!sheet.data) {
    return (
      <>
        {back}
        <EmptyState icon={ClipboardCheck} title="Can't open this attendance sheet">
          {sheet.error instanceof ApiError ? sheet.error.message : 'Try again in a moment.'}
        </EmptyState>
      </>
    );
  }

  const { course, sessions, students, minimum } = sheet.data;
  const short = students.filter((s) => s.summary.state === 'short').length;
  return (
    <>
      {back}
      <PageHeader
        title={`${course.code} ${course.title} · ${course.sectionName ?? ''}`}
        description={`${sessions.length} class${sessions.length === 1 ? '' : 'es'} recorded · minimum ${minimum}%${short ? ` · ${short} student${short === 1 ? '' : 's'} short` : ''}. Open a date to correct marks.`}
      />
      {!sessions.length ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No attendance taken yet"
          className="rounded-lg border bg-surface"
        />
      ) : (
        <div ref={scroller} className="scrollbar-thin overflow-x-auto rounded-lg border bg-surface">
          <table className="w-max min-w-full border-collapse text-[13px]">
            <caption className="sr-only">Attendance register</caption>
            <thead>
              <tr className="bg-surface-2 text-[12px] text-muted-foreground">
                <th
                  scope="col"
                  className="sticky left-0 z-10 w-52 min-w-52 bg-surface-2 px-4 py-2 text-left font-semibold"
                >
                  Student
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  %
                </th>
                {sessions.map((s) => (
                  <th key={s.id} scope="col" className="px-1 py-1.5 font-semibold">
                    <Link
                      to={`/academics/attendance/session/${s.id}`}
                      className="flex flex-col items-center rounded px-1 py-0.5 leading-tight hover:bg-muted hover:text-foreground"
                      title={`${formatShortDate(s.date)}: ${s.counts.present + s.counts.late} of ${s.counts.enrolled} attended`}
                    >
                      <span className="whitespace-nowrap">
                        {formatShortDate(s.date).split(' ').slice(1).join(' ')}
                      </span>
                      <span className="text-[10.5px] font-normal">
                        {formatShortDate(s.date).split(' ')[0]}
                      </span>
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map(({ student, statuses, summary }) => (
                <tr key={student.id} className="border-t">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 w-52 min-w-52 bg-surface px-4 py-1.5 text-left font-normal"
                  >
                    <span className="block font-semibold">{student.name}</span>
                    <span className="block text-[11.5px] text-muted-foreground">
                      {student.regNo}
                    </span>
                  </th>
                  <td
                    className={cn(
                      'px-3 text-right font-bold tabular-nums',
                      summary.state === 'short' && 'text-danger',
                      summary.state === 'warning' && 'text-warning',
                    )}
                  >
                    {summary.percent === null ? '–' : `${summary.percent}%`}
                  </td>
                  {statuses.map((status, i) => (
                    <td
                      // biome-ignore lint/suspicious/noArrayIndexKey: one cell per session column
                      key={i}
                      className={cn(
                        'w-9 text-center text-[12px] font-bold',
                        status ? CELL[status].className : 'text-muted-foreground/50',
                      )}
                      title={status ? ATTENDANCE_LABELS[status] : 'Not marked'}
                    >
                      {status ? CELL[status].text : '·'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
