import {
  campusClock,
  campusInstant,
  EXAM_KIND_LABELS,
  EXAM_KINDS,
  EXAM_SLOTS,
  type ExamCheckDTO,
  type ExamDTO,
  type ExamKind,
  type ExamOptionsDTO,
  examSchema,
  formatClock,
  formatShortDate,
  formatTimeRange,
  type MyExamDTO,
  type UserDTO,
} from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import {
  Armchair,
  CalendarCheck,
  CircleX,
  Ellipsis,
  Megaphone,
  Pencil,
  Plus,
  Sheet,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { EmptyState, Spinner } from '@/components/feedback';
import { PageHeader, Tabs } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/menu';
import { useCurrentUser } from '@/hooks/queries';
import { useDebounced } from '@/hooks/useDebounced';
import { useAction, useSubmit } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { cn } from '@/lib/utils';

export const canManageExams = (me: Pick<UserDTO, 'role' | 'office'>) =>
  me.role === 'admin' || (me.role === 'staff' && me.office === 'EXAM');

function countdown(date: string, start: string): string {
  const days = Math.round(
    (campusInstant(date).getTime() - campusInstant(campusClock().date).getTime()) / 86_400_000,
  );
  if (days === 0) return `today at ${formatClock(start)}`;
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

// ---- The Exam Office ----

interface Draft {
  code: string;
  offeringIds: string[];
  date: string;
  start: string;
  end: string;
  roomIds: string[];
}

function PaperDialog({
  kind,
  exam,
  options,
  onClose,
}: {
  kind: ExamKind;
  exam: ExamDTO | 'new';
  options: ExamOptionsDTO;
  onClose: () => void;
}) {
  const existing = exam === 'new' ? null : exam;
  const [draft, setDraft] = useState<Draft>(() =>
    existing
      ? {
          code: existing.code,
          offeringIds: existing.sections.map((s) => s.offeringId),
          date: existing.date,
          start: existing.start,
          end: existing.end,
          roomIds: existing.rooms.map((r) => r.id),
        }
      : {
          code: options.courses[0]?.code ?? '',
          offeringIds: options.courses[0]?.offerings.map((o) => o.offeringId) ?? [],
          date: campusClock().date,
          start: EXAM_SLOTS[0]?.[0] ?? '09:00',
          end: kind === 'terminal' ? '12:00' : (EXAM_SLOTS[0]?.[1] ?? '10:30'),
          roomIds: [],
        },
  );
  const course = options.courses.find((c) => c.code === draft.code);
  const input = { kind, ...draft };
  const debounced = useDebounced(JSON.stringify(input), 300);
  const check = useQuery({
    queryKey: ['exams', 'check', debounced, existing?.id ?? ''],
    queryFn: () => api.exams.check(JSON.parse(debounced), existing?.id),
    enabled: examSchema.safeParse(input).success,
    retry: false,
  });
  const result: ExamCheckDTO | undefined = check.data;
  const save = useSubmit(examSchema, (data) => api.exams.save(data, existing?.id), {
    done: existing ? 'Paper updated' : 'Paper added to the date sheet',
    invalidate: [keys.exams],
  });
  const students = (course?.offerings ?? [])
    .filter((o) => draft.offeringIds.includes(o.offeringId))
    .reduce((n, o) => n + o.students, 0);
  const seats = options.rooms
    .filter((r) => draft.roomIds.includes(r.id))
    .reduce((n, r) => n + r.seats, 0);
  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.run(input, onClose);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={
          existing
            ? `Edit ${existing.code} ${EXAM_KIND_LABELS[kind]}`
            : `Add a ${EXAM_KIND_LABELS[kind]} paper`
        }
        description="Students, rooms and other papers are checked for clashes as you type."
      >
        <form onSubmit={submit} className="space-y-3">
          <Field label="Course" htmlFor="exam-course">
            <Select
              id="exam-course"
              value={draft.code}
              disabled={!!existing}
              onChange={(e) => {
                const next = options.courses.find((c) => c.code === e.target.value);
                setDraft((d) => ({
                  ...d,
                  code: e.target.value,
                  offeringIds: next?.offerings.map((o) => o.offeringId) ?? [],
                }));
              }}
            >
              {options.courses.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} {c.title}
                </option>
              ))}
            </Select>
          </Field>
          <fieldset className="space-y-1">
            <legend className="mb-1 text-[13px] font-semibold">Sections sitting this paper</legend>
            {course?.offerings.map((o) => (
              <Checkbox
                key={o.offeringId}
                className="mr-4"
                label={`${o.sectionName} (${o.students})`}
                checked={draft.offeringIds.includes(o.offeringId)}
                onChange={() =>
                  setDraft((d) => ({ ...d, offeringIds: toggle(d.offeringIds, o.offeringId) }))
                }
              />
            ))}
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Date" htmlFor="exam-date">
              <Input
                id="exam-date"
                type="date"
                value={draft.date}
                onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
              />
            </Field>
            <Field label="Starts" htmlFor="exam-start">
              <Input
                id="exam-start"
                type="time"
                value={draft.start}
                onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))}
              />
            </Field>
            <Field label="Ends" htmlFor="exam-end">
              <Input
                id="exam-end"
                type="time"
                value={draft.end}
                onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))}
              />
            </Field>
          </div>
          <p className="flex flex-wrap gap-1.5 text-[12.5px] text-muted-foreground">
            Usual times:
            {EXAM_SLOTS.map(([start, end]) => (
              <button
                key={start}
                type="button"
                className="text-link hover:underline"
                onClick={() => setDraft((d) => ({ ...d, start, end }))}
              >
                {formatTimeRange(start, end)}
              </button>
            ))}
          </p>
          <fieldset className="space-y-1">
            <legend className="mb-1 text-[13px] font-semibold">
              Rooms{' '}
              <span
                className={cn(
                  'font-normal',
                  seats < students ? 'text-warning' : 'text-muted-foreground',
                )}
              >
                · {seats} seats for {students} students
              </span>
            </legend>
            {options.rooms.length ? (
              options.rooms.map((r) => (
                <Checkbox
                  key={r.id}
                  className="mr-4"
                  label={`${r.name} (${r.seats})`}
                  checked={draft.roomIds.includes(r.id)}
                  onChange={() => setDraft((d) => ({ ...d, roomIds: toggle(d.roomIds, r.id) }))}
                />
              ))
            ) : (
              <p className="text-[13px] text-muted-foreground">
                No room has exam seating. IT sets exam rows and seats in Admin › Academic setup ›
                Rooms.
              </p>
            )}
          </fieldset>

          {result?.blocking.map((b) => (
            <p
              key={b}
              className="flex gap-2 rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-[13px] text-danger"
            >
              <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden /> {b}
            </p>
          ))}
          {result?.warnings.map((w) => (
            <p
              key={w}
              className="flex gap-2 rounded-md border border-warning/25 bg-warning-soft px-3 py-2 text-[13px] text-warning"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {w}
            </p>
          ))}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.pending} disabled={!!result?.blocking.length}>
              {existing ? 'Save paper' : 'Add paper'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DateSheet() {
  const [params, setParams] = useSearchParams();
  const kind = (params.get('kind') as ExamKind | null) ?? 'sessional2';
  const all = useQuery({ queryKey: keys.exams, queryFn: () => api.exams.list() });
  const options = useQuery({ queryKey: ['exams', 'options'], queryFn: api.exams.options });
  const [editing, setEditing] = useState<ExamDTO | 'new' | null>(null);
  const [removing, setRemoving] = useState<ExamDTO | null>(null);
  const navigate = useNavigate();
  const exams = (all.data ?? []).filter((e) => e.kind === kind);
  const unpublished = exams.filter((e) => !e.published).length;

  const publish = useAction(() => api.exams.publish(kind), {
    done: (r) =>
      `${EXAM_KIND_LABELS[kind]} date sheet published (${r.published} papers). Students were told their papers.`,
    invalidate: [keys.exams],
  });
  const seat = useAction((examId: string) => api.exams.assignSeats(examId), {
    done: (r) =>
      r.unseated
        ? `${r.seated} seated, ${r.unseated} without a seat: add a room.`
        : `${r.seated} students seated, sections mixed.`,
    invalidate: [keys.exams],
  });
  const remove = useAction((examId: string) => api.exams.remove(examId), {
    done: 'Paper removed',
    invalidate: [keys.exams],
  });

  const byDate = useMemo(() => {
    const groups = new Map<string, ExamDTO[]>();
    for (const e of exams) groups.set(e.date, [...(groups.get(e.date) ?? []), e]);
    return [...groups.entries()];
  }, [exams]);

  return (
    <>
      <PageHeader
        title="Exams"
        description="The date sheet. A paper is refused if a student would sit two papers at once or a room is double-booked. Publishing tells each student their own papers."
        actions={
          <>
            <Button variant="outline" disabled={!options.data} onClick={() => setEditing('new')}>
              <Plus /> Add paper
            </Button>
            <Button
              disabled={!exams.length || !unpublished}
              loading={publish.isPending}
              onClick={() => publish.mutate(undefined)}
            >
              <Megaphone /> {exams.length && !unpublished ? 'Published' : 'Publish date sheet'}
            </Button>
          </>
        }
      />
      <Tabs
        label="Exam"
        value={kind}
        onChange={(value) => setParams({ kind: value }, { replace: true })}
        options={EXAM_KINDS.map((k) => ({
          value: k,
          label: EXAM_KIND_LABELS[k],
          count: (all.data ?? []).filter((e) => e.kind === k).length,
        }))}
      />
      {all.isPending ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !exams.length ? (
        <EmptyState
          icon={CalendarCheck}
          title={`No ${EXAM_KIND_LABELS[kind]} papers yet`}
          className="rounded-lg border bg-surface"
        >
          Add a paper for each course. Sections taking the same course sit it together.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {byDate.map(([date, list]) => (
            <section
              key={date}
              aria-label={formatShortDate(date)}
              className="overflow-hidden rounded-lg border bg-surface"
            >
              <h2 className="border-b bg-surface-2 px-4 py-2 text-[13px] font-bold">
                {formatShortDate(date)}
              </h2>
              <ul className="divide-y">
                {list.map((e) => (
                  <li
                    key={e.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5"
                  >
                    <span className="w-36 text-[13px] font-semibold tabular-nums">
                      {formatTimeRange(e.start, e.end)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">
                        <span className="font-mono text-[12.5px] text-muted-foreground">
                          {e.code}
                        </span>{' '}
                        {e.title}
                      </span>
                      <span className="block text-[12.5px] text-muted-foreground">
                        {e.sections.map((s) => s.sectionName).join(', ')} ·{' '}
                        {e.rooms.length ? e.rooms.map((r) => r.name).join(', ') : 'No room yet'}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'text-[12.5px] tabular-nums',
                        e.seats < e.students ? 'text-warning' : 'text-muted-foreground',
                      )}
                    >
                      {e.seated
                        ? `${e.seated}/${e.students} seated`
                        : `${e.students} students · ${e.seats} seats`}
                    </span>
                    {e.published ? <Badge tone="primary">Published</Badge> : <Badge>Draft</Badge>}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Options for ${e.code}`}>
                          <Ellipsis />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => seat.mutate(e.id)}
                          disabled={!e.rooms.length}
                        >
                          <Armchair /> {e.seated ? 'Reassign seats' : 'Assign seats'}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => navigate(`/academics/exams/${e.id}/seating`)}
                        >
                          <Sheet /> Seating chart
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setEditing(e)}>
                          <Pencil /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem danger onSelect={() => setRemoving(e)}>
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {editing && options.data && (
        <PaperDialog
          kind={kind}
          exam={editing}
          options={options.data}
          onClose={() => setEditing(null)}
        />
      )}
      <Dialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent
          title={`Remove ${removing?.code ?? ''} from the date sheet?`}
          description={
            removing?.published
              ? 'Its students are told the paper was removed.'
              : 'Its seats are deleted too.'
          }
        >
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() =>
                removing && remove.mutate(removing.id, { onSuccess: () => setRemoving(null) })
              }
            >
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---- Students and teachers ----

function PaperCard({ exam, teacher }: { exam: MyExamDTO; teacher: boolean }) {
  const past = exam.date < campusClock().date;
  return (
    <li
      className={cn(
        'flex flex-wrap items-center gap-4 rounded-lg border bg-surface px-4 py-3',
        past && 'opacity-60',
      )}
    >
      <div className="w-16 text-center">
        <p className="text-[12px] font-semibold text-muted-foreground uppercase">
          {formatShortDate(exam.date).split(' ')[0]}
        </p>
        <p className="text-[22px] leading-tight font-bold tabular-nums">
          {Number(exam.date.slice(8))}
        </p>
        <p className="text-[12px] text-muted-foreground">
          {formatShortDate(exam.date).split(' ')[2]}
        </p>
      </div>
      <div className="min-w-48 flex-1">
        <p className="text-[14.5px] font-bold sm:truncate">
          <span className="font-mono text-[12.5px] text-muted-foreground">{exam.code}</span>{' '}
          {exam.title}
        </p>
        <p className="text-[13px] text-muted-foreground">
          {formatTimeRange(exam.start, exam.end)}
          {teacher ? ` · ${exam.sections.join(', ')}` : ''} ·{' '}
          {exam.rooms.map((r) => r.name).join(', ') || 'Room to be announced'}
          {!past && ` · ${countdown(exam.date, exam.start)}`}
        </p>
      </div>
      {teacher ? (
        <Link
          to={`/academics/exams/${exam.id}/seating`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <Sheet /> Seating chart
        </Link>
      ) : exam.seat ? (
        <div className="rounded-md border border-primary/25 bg-primary-soft px-3 py-1.5 text-center text-primary dark:text-link">
          <p className="text-[11.5px] font-semibold uppercase">Your seat</p>
          <p className="text-[14px] font-bold tabular-nums">
            {exam.seat.room.name} · R{exam.seat.row} S{exam.seat.seat}
          </p>
        </div>
      ) : (
        <Badge>Seat not assigned yet</Badge>
      )}
    </li>
  );
}

function MyExams({ teacher }: { teacher: boolean }) {
  const { data, isPending } = useQuery({ queryKey: keys.myExams, queryFn: api.exams.mine });
  const kinds = EXAM_KINDS.filter((k) => data?.some((e) => e.kind === k));
  return (
    <>
      <PageHeader
        title={teacher ? 'Exams' : 'My exams'}
        description={
          teacher
            ? 'Papers of the courses you teach, with seating charts for invigilation.'
            : 'Your published papers with room, row and seat. You are told as soon as anything changes.'
        }
      />
      {isPending ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !data?.length ? (
        <EmptyState
          icon={CalendarCheck}
          title="No exams published yet"
          className="rounded-lg border bg-surface"
        >
          The Examination Office publishes each date sheet; it appears here immediately.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {[...kinds].reverse().map((kind) => (
            <section key={kind} aria-label={EXAM_KIND_LABELS[kind]}>
              <h2 className="mb-2 text-[15px] font-bold">{EXAM_KIND_LABELS[kind]}</h2>
              <ul className="space-y-2">
                {data
                  .filter((e) => e.kind === kind)
                  .map((e) => (
                    <PaperCard key={e.id} exam={e} teacher={teacher} />
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

/** The Exam Office builds date sheets; students see their papers and seats; teachers theirs. */
export default function ExamsPage() {
  const me = useCurrentUser();
  const [, setTick] = useState(0);
  // Re-render at midnight-ish so countdowns stay right on a page left open.
  useEffect(() => {
    const timer = window.setInterval(() => setTick((t) => t + 1), 10 * 60_000);
    return () => window.clearInterval(timer);
  }, []);
  if (canManageExams(me)) return <DateSheet />;
  if (me.role === 'student' || me.role === 'faculty')
    return <MyExams teacher={me.role === 'faculty'} />;
  return (
    <>
      <PageHeader title="Exams" />
      <EmptyState icon={CalendarCheck} title="Date sheets are managed by the Examination Office" />
    </>
  );
}
