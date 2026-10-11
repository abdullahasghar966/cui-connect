import {
  ASSESSMENT_LABELS,
  ASSESSMENT_TYPES,
  type AssessmentDTO,
  type AssessmentType,
  assessmentSchema,
  campusClock,
  DEFAULT_GRADING,
  formatShortDate,
  type GradingWeights,
  gradingWeightsSchema,
  type MarksSheetDTO,
} from '@cui/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Ellipsis,
  Eye,
  EyeOff,
  Lock,
  NotebookPen,
  Pencil,
  Plus,
  Scale,
  Trash2,
} from 'lucide-react';
import { type FormEvent, type KeyboardEvent, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, Spinner } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/menu';
import { errorMessage, useAction, useSubmit } from '@/hooks/useSubmit';
import { ApiError, api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { cn } from '@/lib/utils';

type Drafts = Record<string, Record<string, string>>;

function AssessmentDialog({
  offeringId,
  editing,
  count,
  onClose,
}: {
  offeringId: string;
  editing: AssessmentDTO | 'new';
  count: Record<AssessmentType, number>;
  onClose: () => void;
}) {
  const existing = editing === 'new' ? null : editing;
  const [type, setType] = useState<AssessmentType>(existing?.type ?? 'quiz');
  const suggested = (t: AssessmentType) =>
    t === 'sessional1' || t === 'sessional2' || t === 'terminal'
      ? ASSESSMENT_LABELS[t]
      : `${ASSESSMENT_LABELS[t].replace(/s$/, '').replace('Lab work', 'Lab')} ${count[t] + 1}`;
  const [title, setTitle] = useState(existing?.title ?? suggested('quiz'));
  const [total, setTotal] = useState(String(existing?.total ?? 10));
  const [date, setDate] = useState(existing?.date ?? campusClock().date);
  const save = useSubmit(
    assessmentSchema,
    async (input) => {
      if (existing) await api.teaching.updateAssessment(existing.id, input);
      else await api.teaching.addAssessment(offeringId, input);
    },
    {
      done: existing ? 'Assessment updated' : 'Assessment added. Enter marks, then publish it.',
      invalidate: [keys.marksSheet(offeringId), keys.teachingCourses],
    },
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.run({ type, title, total: Number(total), date: date || null }, onClose);
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={existing ? 'Edit assessment' : 'Add an assessment'}>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kind" htmlFor="a-type">
              <Select
                id="a-type"
                value={type}
                onChange={(e) => {
                  const next = e.target.value as AssessmentType;
                  if (!existing && title === suggested(type)) setTitle(suggested(next));
                  setType(next);
                }}
              >
                {ASSESSMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ASSESSMENT_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Title" htmlFor="a-title">
              <Input id="a-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Total marks" htmlFor="a-total">
              <Input
                id="a-total"
                type="number"
                min={1}
                step="0.5"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
              />
            </Field>
            <Field label="Date" htmlFor="a-date">
              <Input
                id="a-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.pending}>
              {existing ? 'Save' : 'Add assessment'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GradingDialog({
  offeringId,
  current,
  custom,
  onClose,
}: {
  offeringId: string;
  current: GradingWeights;
  custom: boolean;
  onClose: () => void;
}) {
  const [weights, setWeights] = useState(
    Object.fromEntries(ASSESSMENT_TYPES.map((t) => [t, String(current[t])])) as Record<
      AssessmentType,
      string
    >,
  );
  const numbers = Object.fromEntries(
    ASSESSMENT_TYPES.map((t) => [t, Number(weights[t] || 0)]),
  ) as GradingWeights;
  const total = ASSESSMENT_TYPES.reduce((sum, t) => sum + numbers[t], 0);
  const save = useAction(
    (w: GradingWeights | null) => api.teaching.setGrading(offeringId, { weights: w }),
    {
      done: 'Grading weights saved',
      invalidate: [keys.marksSheet(offeringId)],
    },
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = gradingWeightsSchema.safeParse(numbers);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Check the weights');
      return;
    }
    save.mutate(parsed.data, { onSuccess: onClose });
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Grading weights"
        description="How much each kind of assessment counts towards the final grade. Assessments of the same kind share its weight equally."
      >
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            {ASSESSMENT_TYPES.map((t) => (
              <Field key={t} label={`${ASSESSMENT_LABELS[t]} (%)`} htmlFor={`w-${t}`}>
                <Input
                  id={`w-${t}`}
                  type="number"
                  min={0}
                  max={100}
                  value={weights[t]}
                  onChange={(e) => setWeights((w) => ({ ...w, [t]: e.target.value }))}
                />
              </Field>
            ))}
          </div>
          <p
            className={cn(
              'text-[13px] font-semibold tabular-nums',
              total === 100 ? 'text-primary dark:text-link' : 'text-danger',
            )}
            aria-live="polite"
          >
            Total: {total}% {total === 100 ? '' : '(must be 100)'}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            {custom && (
              <Button
                variant="ghost"
                onClick={() => save.mutate(null, { onSuccess: onClose })}
                className="mr-auto"
              >
                Use the campus default
              </Button>
            )}
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending} disabled={total !== 100}>
              Save weights
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const parseMark = (text: string): number | null | 'invalid' => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : 'invalid';
};

/** The teacher's marks grid for one course: enter, save, publish, finalise. */
export default function MarksPage() {
  const { offeringId = '' } = useParams();
  const qc = useQueryClient();
  const key = keys.marksSheet(offeringId);
  const query = useQuery({
    queryKey: key,
    queryFn: () => api.teaching.marks(offeringId),
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
  });
  const [drafts, setDrafts] = useState<Drafts>({});
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<AssessmentDTO | 'new' | null>(null);
  const [grading, setGrading] = useState(false);
  const [confirmFinal, setConfirmFinal] = useState(false);
  const [removing, setRemoving] = useState<AssessmentDTO | null>(null);

  const publish = useAction(
    ({ id, on }: { id: string; on: boolean }) => api.teaching.publish(id, on),
    {
      done: 'Done. Students see published marks immediately.',
      invalidate: [key, keys.teachingCourses],
    },
  );
  const remove = useAction((id: string) => api.teaching.deleteAssessment(id), {
    done: 'Assessment removed',
    invalidate: [key, keys.teachingCourses],
  });
  const finalize = useAction(() => api.teaching.finalize(offeringId), {
    done: (r) =>
      `Final grades saved for ${r.finalized} students. Each student was told their grade.`,
    invalidate: [key, keys.teachingCourses],
  });

  const data = query.data;
  const count = useMemo(() => {
    const c = Object.fromEntries(ASSESSMENT_TYPES.map((t) => [t, 0])) as Record<
      AssessmentType,
      number
    >;
    for (const a of data?.assessments ?? []) c[a.type]++;
    return c;
  }, [data]);

  if (query.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  const back = (
    <Link
      to="/academics/results"
      className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden /> Marks
    </Link>
  );
  if (!data) {
    return (
      <>
        {back}
        <EmptyState icon={NotebookPen} title="Can't open these marks">
          {query.error instanceof ApiError ? query.error.message : 'Try again in a moment.'}
        </EmptyState>
      </>
    );
  }

  const cellText = (sheet: MarksSheetDTO, a: number, s: number) => {
    const assessment = sheet.assessments[a];
    const student = sheet.students[s];
    if (!assessment || !student) return '';
    const draft = drafts[assessment.id]?.[student.student.id];
    if (draft !== undefined) return draft;
    const saved = student.marks[a];
    return saved === null || saved === undefined ? '' : String(saved);
  };
  const dirty = Object.entries(drafts).filter(([, d]) => Object.keys(d).length > 0);
  const invalid = dirty.some(([id, d]) => {
    const total = data.assessments.find((a) => a.id === id)?.total ?? 0;
    return Object.values(d).some((text) => {
      const v = parseMark(text);
      return v === 'invalid' || (v !== null && v > total);
    });
  });

  const setDraft = (
    assessmentId: string,
    studentId: string,
    text: string,
    saved: number | null,
  ) => {
    setDrafts((all) => {
      const next = { ...(all[assessmentId] ?? {}) };
      if (text.trim() === (saved === null ? '' : String(saved))) delete next[studentId];
      else next[studentId] = text;
      return { ...all, [assessmentId]: next };
    });
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const [assessmentId, entries] of dirty) {
        await api.teaching.saveMarks(assessmentId, {
          marks: Object.entries(entries).map(([studentId, text]) => ({
            studentId,
            obtained: parseMark(text) as number | null,
          })),
        });
      }
      setDrafts({});
      toast.success('Marks saved');
      await qc.invalidateQueries({ queryKey: key });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // Enter moves down a column, like a spreadsheet.
  const onKey = (e: KeyboardEvent<HTMLInputElement>, a: number, s: number) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const next = document.querySelector<HTMLInputElement>(
      `[data-cell="${a}:${s + (e.shiftKey ? -1 : 1)}"]`,
    );
    next?.focus();
    next?.select();
  };

  const { course, assessments, students, grading: weights, canManage } = data;
  const weighted = ASSESSMENT_TYPES.filter((t) => weights[t] > 0);

  return (
    <>
      {back}
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] leading-tight font-bold tracking-tight">
            {course.code} {course.title} · {course.sectionName}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
            {weighted.map((t) => `${ASSESSMENT_LABELS[t]} ${weights[t]}%`).join(' · ')}
            {data.customGrading ? (
              <Badge>Custom weights</Badge>
            ) : (
              <Badge tone="outline">Campus default</Badge>
            )}
            {data.finalizedAt && (
              <Badge tone="primary">
                <Lock /> Grades final
              </Badge>
            )}
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setGrading(true)}>
              <Scale /> Weights
            </Button>
            <Button variant="outline" onClick={() => setEditing('new')}>
              <Plus /> Add assessment
            </Button>
            <Button onClick={() => setConfirmFinal(true)}>
              <Lock /> {data.finalizedAt ? 'Finalise again' : 'Finalise grades'}
            </Button>
          </div>
        )}
      </header>

      {!assessments.length ? (
        <EmptyState
          icon={NotebookPen}
          title="No assessments yet"
          className="rounded-lg border bg-surface"
        >
          Add your first quiz, assignment or sessional to start entering marks.
        </EmptyState>
      ) : (
        <div className="scrollbar-thin overflow-x-auto rounded-lg border bg-surface">
          <table className="w-max min-w-full border-collapse text-[13px]">
            <caption className="sr-only">Marks</caption>
            <thead>
              <tr className="bg-surface-2 align-bottom text-[12px] text-muted-foreground">
                <th
                  scope="col"
                  className="sticky left-0 z-10 w-52 min-w-52 bg-surface-2 px-4 py-2 text-left font-semibold"
                >
                  Student
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  So far
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  {data.finalizedAt ? 'Final' : 'Projected'}
                </th>
                {assessments.map((a) => (
                  <th
                    key={a.id}
                    scope="col"
                    className="min-w-28 border-l px-2 py-2 text-left font-normal"
                  >
                    <div className="flex items-start gap-1">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold text-foreground">
                          {a.title}
                        </p>
                        <p className="text-[11.5px]">
                          {ASSESSMENT_LABELS[a.type]} · /{a.total}
                          {a.date
                            ? ` · ${formatShortDate(a.date).split(' ').slice(1).join(' ')}`
                            : ''}
                        </p>
                        {a.published ? (
                          <Badge tone="primary" className="mt-1">
                            <Eye /> Published
                          </Badge>
                        ) : (
                          <Badge className="mt-1">
                            <EyeOff /> Hidden
                          </Badge>
                        )}
                      </div>
                      {canManage && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Options for ${a.title}`}
                            >
                              <Ellipsis />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() => publish.mutate({ id: a.id, on: !a.published })}
                            >
                              {a.published ? <EyeOff /> : <Eye />}
                              {a.published ? 'Hide from students' : 'Publish to students'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setEditing(a)}>
                              <Pencil /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem danger onSelect={() => setRemoving(a)}>
                              <Trash2 /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((row, s) => {
                const shown = row.final ?? row.projected;
                return (
                  <tr key={row.student.id} className="border-t">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 w-52 min-w-52 bg-surface px-4 py-1.5 text-left font-normal"
                    >
                      <span className="block font-semibold">{row.student.name}</span>
                      <span className="block text-[11.5px] text-muted-foreground">
                        {row.student.regNo}
                      </span>
                    </th>
                    <td className="px-3 text-right text-muted-foreground tabular-nums">
                      {row.standing.earned}/{row.standing.completedWeight}
                    </td>
                    <td className="px-3 text-right whitespace-nowrap">
                      <span className="font-bold">{shown?.grade ?? '–'}</span>{' '}
                      <span className="text-[12px] text-muted-foreground tabular-nums">
                        {shown ? `${shown.percent}%` : ''}
                      </span>
                    </td>
                    {assessments.map((a, i) => {
                      const text = cellText(data, i, s);
                      const parsed = parseMark(text);
                      const bad = parsed === 'invalid' || (parsed !== null && parsed > a.total);
                      const changed = drafts[a.id]?.[row.student.id] !== undefined;
                      return (
                        <td key={a.id} className="border-l px-2 py-1">
                          {canManage ? (
                            <Input
                              data-cell={`${i}:${s}`}
                              inputMode="decimal"
                              aria-label={`${a.title} for ${row.student.name}`}
                              aria-invalid={bad || undefined}
                              value={text}
                              onChange={(e) =>
                                setDraft(a.id, row.student.id, e.target.value, row.marks[i] ?? null)
                              }
                              onKeyDown={(e) => onKey(e, i, s)}
                              className={cn(
                                'h-8 w-20 text-right tabular-nums',
                                changed && 'border-primary bg-primary-soft/40',
                                bad && 'border-danger bg-danger-soft focus:border-danger',
                              )}
                            />
                          ) : (
                            <span className="block w-20 text-right tabular-nums">
                              {text || '–'}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-surface-2 text-[12px] text-muted-foreground">
              {(['average', 'highest', 'lowest'] as const).map((stat) => (
                <tr key={stat} className="border-t">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-surface-2 px-4 py-1.5 text-left font-semibold capitalize"
                  >
                    {stat}
                  </th>
                  <td colSpan={2} />
                  {assessments.map((a) => (
                    <td key={a.id} className="border-l px-2 py-1.5 text-right tabular-nums">
                      <span className="inline-block w-20">{a.stats[stat] ?? '–'}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      )}

      {canManage && dirty.length > 0 && (
        <div className="sticky bottom-3 z-20 mt-4 flex flex-wrap items-center gap-3 rounded-lg border bg-surface px-4 py-2.5 shadow-lg">
          <p className="flex-1 text-[13.5px]">
            {invalid
              ? 'Some marks are not valid numbers or are above the total.'
              : `Unsaved marks in ${dirty.length} assessment${dirty.length === 1 ? '' : 's'}.`}
          </p>
          <Button variant="outline" onClick={() => setDrafts({})}>
            Discard
          </Button>
          <Button loading={saving} disabled={invalid} onClick={saveAll}>
            Save marks
          </Button>
        </div>
      )}

      {editing && (
        <AssessmentDialog
          offeringId={offeringId}
          editing={editing}
          count={count}
          onClose={() => setEditing(null)}
        />
      )}
      {grading && (
        <GradingDialog
          offeringId={offeringId}
          current={weights ?? DEFAULT_GRADING}
          custom={data.customGrading}
          onClose={() => setGrading(false)}
        />
      )}
      <Dialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent
          title={`Delete ${removing?.title ?? ''}?`}
          description="Its marks are deleted too. Students stop seeing it."
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
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmFinal} onOpenChange={setConfirmFinal}>
        <DialogContent
          title="Finalise grades?"
          description="Each student's final grade is worked out from the published marks and added to their transcript and CGPA. Every part of the course needs published marks, and every student a mark in each (enter 0 for an absence). You can finalise again after a correction."
        >
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmFinal(false)}>
              Cancel
            </Button>
            <Button
              loading={finalize.isPending}
              disabled={dirty.length > 0}
              onClick={() =>
                finalize.mutate(undefined, { onSuccess: () => setConfirmFinal(false) })
              }
            >
              {dirty.length ? 'Save marks first' : 'Finalise'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
