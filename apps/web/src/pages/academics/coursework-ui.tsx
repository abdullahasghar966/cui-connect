/** Pieces shared by the coursework pages: badges, due times, and the teacher's dialogs. */
import {
  type AssignmentDTO,
  type AssignmentState,
  addDays,
  assignmentSchema,
  campusClock,
  campusInstant,
  dueIn,
  type FileDTO,
  formatInstant,
  materialSchema,
  type QuizStatus,
  type QuizSummaryDTO,
  submissionWindow,
} from '@cui/shared';
import { Radio } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { FilePicker } from '@/components/coursework/files';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { useCurrentTerm } from '@/hooks/academics';
import { useSubmit } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { cn } from '@/lib/utils';

export const STATE_BADGE: Record<
  AssignmentState,
  { tone: 'primary' | 'success' | 'warning' | 'danger' | 'neutral'; label: string }
> = {
  todo: { tone: 'primary', label: 'To do' },
  submitted: { tone: 'success', label: 'Handed in' },
  late: { tone: 'warning', label: 'Handed in late' },
  missing: { tone: 'danger', label: 'Missing' },
  graded: { tone: 'neutral', label: 'Graded' },
};

export const QUIZ_BADGE: Record<
  QuizStatus,
  { tone: 'neutral' | 'danger' | 'outline'; label: string }
> = {
  draft: { tone: 'outline', label: 'Draft' },
  live: { tone: 'danger', label: 'Live now' },
  ended: { tone: 'neutral', label: 'Ended' },
};

/** "Fri 23 Oct, 11:59 PM · due in 3 days" (or just the time left when `short`), red once overdue. */
export function DueText({
  dueAt,
  lateUntil,
  className,
  short,
}: {
  dueAt: string;
  lateUntil: string | null;
  className?: string;
  short?: boolean;
}) {
  const phase = submissionWindow({ dueAt, lateUntil });
  return (
    <span className={cn('text-[13px] text-muted-foreground', className)}>
      {!short && `${formatInstant(dueAt)} · `}
      <span
        className={cn(
          phase === 'open' && Date.parse(dueAt) - Date.now() < 24 * 3600_000 && 'text-warning',
          phase !== 'open' && 'text-danger',
          'font-semibold',
        )}
      >
        {phase === 'closed' ? 'closed' : dueIn(dueAt)}
      </span>
    </span>
  );
}

/** Campus date and time of an instant, for date and time inputs. */
export function campusParts(iso: string): { date: string; time: string } {
  const clock = campusClock(new Date(iso));
  const h = String(Math.floor(clock.minutes / 60)).padStart(2, '0');
  const m = String(clock.minutes % 60).padStart(2, '0');
  return { date: clock.date, time: `${h}:${m}` };
}

const toInstant = (date: string, time: string) => {
  const at = campusInstant(date, time || '23:59');
  return Number.isNaN(at.getTime()) ? '' : at.toISOString();
};

/** The week of the term a date falls in (1 = the first week). */
export function useTermWeek(): number {
  const term = useCurrentTerm();
  if (!term) return 1;
  const days = (Date.parse(campusClock().date) - Date.parse(term.startsOn)) / 86_400_000;
  return Math.min(18, Math.max(1, Math.floor(days / 7) + 1));
}

export function LiveQuizBanner({ quiz, host }: { quiz: QuizSummaryDTO; host: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3">
      <Radio className="size-5 animate-pulse text-danger" aria-hidden />
      <p className="min-w-0 flex-1 text-[14px]">
        <span className="font-bold text-danger">Live quiz</span> ·{' '}
        <span className="font-semibold">{quiz.title}</span>{' '}
        <span className="text-muted-foreground">
          {quiz.course.code} {quiz.course.title}
        </span>
      </p>
      <Link to={`/academics/quizzes/${quiz.id}`} className={buttonVariants({ size: 'md' })}>
        {host ? 'Open host screen' : 'Join now'}
      </Link>
    </div>
  );
}

// ---- Teacher dialogs ----

export function AssignmentDialog({
  offeringId,
  assignment,
  onClose,
  onSaved,
}: {
  offeringId: string;
  assignment?: AssignmentDTO;
  onClose: () => void;
  onSaved?: (saved: AssignmentDTO) => void;
}) {
  const due = assignment
    ? campusParts(assignment.dueAt)
    : { date: addDays(campusClock().date, 7), time: '23:59' };
  const late = assignment?.lateUntil ? campusParts(assignment.lateUntil) : null;
  const [form, setForm] = useState({
    title: assignment?.title ?? '',
    instructions: assignment?.instructions ?? '',
    dueDate: due.date,
    dueTime: due.time,
    acceptLate: !!late,
    lateDate: late?.date ?? addDays(due.date, 2),
    lateTime: late?.time ?? '23:59',
    total: String(assignment?.total ?? 10),
  });
  const [attachments, setAttachments] = useState<FileDTO[]>(assignment?.attachments ?? []);
  const save = useSubmit(
    assignmentSchema,
    (input) =>
      api.teaching.saveAssignment(input, assignment ? { id: assignment.id } : { offeringId }),
    {
      done: assignment ? 'Assignment updated' : 'Assignment set. The class has been told.',
      invalidate: [keys.coursework],
    },
  );
  const set = (field: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.run(
      {
        title: form.title,
        instructions: form.instructions.trim() || null,
        dueAt: toInstant(form.dueDate, form.dueTime),
        lateUntil: form.acceptLate ? toInstant(form.lateDate, form.lateTime) : null,
        total: Number(form.total),
        attachmentIds: attachments.map((f) => f.id),
      },
      (saved) => {
        onSaved?.(saved);
        onClose();
      },
    );
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        wide
        title={assignment ? 'Edit assignment' : 'New assignment'}
        description="Students hand in files or a written answer. Grades go into the marks sheet."
      >
        <form onSubmit={submit} className="space-y-3">
          <Field label="Title" htmlFor="as-title">
            <Input
              id="as-title"
              value={form.title}
              onChange={set('title')}
              placeholder="e.g. Assignment 2: REST API with Express"
            />
          </Field>
          <Field label="Instructions" htmlFor="as-instructions">
            <Textarea
              id="as-instructions"
              rows={5}
              value={form.instructions}
              onChange={set('instructions')}
              placeholder="What to do, what to hand in, how it will be marked."
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Due date" htmlFor="as-due">
              <Input id="as-due" type="date" value={form.dueDate} onChange={set('dueDate')} />
            </Field>
            <Field label="Due time" htmlFor="as-due-time">
              <Input id="as-due-time" type="time" value={form.dueTime} onChange={set('dueTime')} />
            </Field>
            <Field label="Total marks" htmlFor="as-total">
              <Input
                id="as-total"
                type="number"
                min={1}
                max={100}
                value={form.total}
                onChange={set('total')}
              />
            </Field>
          </div>
          <Checkbox
            label="Accept late work (marked late)"
            checked={form.acceptLate}
            onChange={(e) => setForm((f) => ({ ...f, acceptLate: e.target.checked }))}
          />
          {form.acceptLate && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Late work until" htmlFor="as-late">
                <Input id="as-late" type="date" value={form.lateDate} onChange={set('lateDate')} />
              </Field>
              <Field label="Time" htmlFor="as-late-time">
                <Input
                  id="as-late-time"
                  type="time"
                  value={form.lateTime}
                  onChange={set('lateTime')}
                />
              </Field>
            </div>
          )}
          <Field label="Handouts (optional)">
            <FilePicker
              files={attachments}
              onChange={setAttachments}
              purpose="assignment"
              offeringId={offeringId}
              label="Attach handouts"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.pending}>
              {assignment ? 'Save changes' : 'Set assignment'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MaterialDialog({
  offeringId,
  onClose,
}: {
  offeringId: string;
  onClose: () => void;
}) {
  // This week of the term (once the term has loaded), until the teacher picks another.
  const termWeek = useTermWeek();
  const [form, setForm] = useState({
    week: '',
    title: '',
    description: '',
    kind: 'file' as 'file' | 'link',
    url: '',
  });
  const [files, setFiles] = useState<FileDTO[]>([]);
  const save = useSubmit(materialSchema, (input) => api.teaching.addMaterial(offeringId, input), {
    done: 'Material added',
    invalidate: [keys.coursework],
  });
  const set = (field: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.run(
      {
        week: Number(form.week || termWeek),
        title: form.title,
        description: form.description.trim() || null,
        fileId: form.kind === 'file' ? (files[0]?.id ?? null) : null,
        url: form.kind === 'link' ? form.url.trim() || null : null,
      },
      onClose,
    );
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Add material" description="Slides, notes, readings or a useful link.">
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
            <Field label="Week" htmlFor="mat-week">
              <Select id="mat-week" value={form.week || String(termWeek)} onChange={set('week')}>
                {Array.from({ length: 18 }, (_, i) => i + 1).map((w) => (
                  <option key={w} value={w}>
                    Week {w}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Title" htmlFor="mat-title">
              <Input
                id="mat-title"
                value={form.title}
                onChange={set('title')}
                placeholder="e.g. Lecture 6 slides: Express middleware"
              />
            </Field>
          </div>
          <div role="radiogroup" aria-label="Material type" className="flex gap-4 text-[13.5px]">
            {(['file', 'link'] as const).map((kind) => (
              <label key={kind} className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="mat-kind"
                  className="accent-primary"
                  checked={form.kind === kind}
                  onChange={() => setForm((f) => ({ ...f, kind }))}
                />
                {kind === 'file' ? 'Upload a file' : 'Link to a web page'}
              </label>
            ))}
          </div>
          {form.kind === 'file' ? (
            <FilePicker
              files={files}
              onChange={setFiles}
              purpose="material"
              offeringId={offeringId}
              max={1}
              label="Choose file"
            />
          ) : (
            <Field label="Link" htmlFor="mat-url">
              <Input
                id="mat-url"
                type="url"
                value={form.url}
                onChange={set('url')}
                placeholder="https://"
              />
            </Field>
          )}
          <Field label="Note (optional)" htmlFor="mat-desc">
            <Textarea
              id="mat-desc"
              rows={2}
              value={form.description}
              onChange={set('description')}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.pending}>
              Add material
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function QuizBadge({ status }: { status: QuizStatus }) {
  const badge = QUIZ_BADGE[status];
  return <Badge tone={badge.tone}>{badge.label}</Badge>;
}
