import {
  type AssignmentDetailDTO,
  type FileDTO,
  formatInstant,
  submissionSchema,
  submissionWindow,
} from '@cui/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, ClipboardList, Ellipsis, Pencil, Send, Trash2, Undo2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { FileList, FilePicker } from '@/components/coursework/files';
import { EmptyState, Spinner } from '@/components/feedback';
import { Card, PageHeader, Stat, StatStrip, Table } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/form';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/menu';
import { errorMessage, useAction, useSubmit } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { cn } from '@/lib/utils';
import { AssignmentDialog, DueText } from './coursework-ui';

type Detail = AssignmentDetailDTO;

/** The student's side: what they handed in, the form to hand in, and the grade once returned. */
function YourWork({ data }: { data: Detail }) {
  const { assignment, mine, grade } = data;
  const phase = submissionWindow(assignment);
  const canHandIn = phase !== 'closed' && !assignment.returned;
  const [files, setFiles] = useState<FileDTO[]>(mine?.files ?? []);
  const [note, setNote] = useState(mine?.note ?? '');
  const [editing, setEditing] = useState(!mine);
  const invalidate = [keys.coursework];
  const submit = useSubmit(
    submissionSchema,
    (input) => api.coursework.submit(assignment.id, input),
    {
      done: (saved) => (saved.late ? 'Handed in (late)' : 'Handed in'),
      invalidate,
    },
  );
  const withdraw = useAction(() => api.coursework.withdraw(assignment.id), {
    done: 'Submission taken back',
    invalidate,
  });
  const handIn = (e: FormEvent) => {
    e.preventDefault();
    submit.run({ fileIds: files.map((f) => f.id), note: note.trim() || null }, () =>
      setEditing(false),
    );
  };

  return (
    <Card title="Your work">
      <div className="space-y-4 p-4">
        {grade && (
          <div className="rounded-lg border border-primary/25 bg-primary-soft px-4 py-3">
            <p className="text-[12.5px] font-semibold text-muted-foreground">Grade</p>
            <p className="text-[28px] leading-tight font-bold tabular-nums">
              {grade.obtained ?? '–'}
              <span className="text-[16px] text-muted-foreground">/{assignment.total}</span>
            </p>
            {grade.feedback && (
              <p className="mt-1 text-[13.5px] whitespace-pre-wrap">{grade.feedback}</p>
            )}
          </div>
        )}

        {mine && !editing ? (
          <div className="space-y-2">
            <p className="flex flex-wrap items-center gap-2 text-[13.5px]">
              <CircleCheck className="size-4 text-success" aria-hidden />
              <span className="font-semibold">Handed in {formatInstant(mine.submittedAt)}</span>
              {mine.late && <Badge tone="warning">Late</Badge>}
            </p>
            <FileList files={mine.files} />
            {mine.note && (
              <p className="rounded-md border bg-surface-2 px-3 py-2 text-[13.5px] whitespace-pre-wrap">
                {mine.note}
              </p>
            )}
            {canHandIn && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Pencil /> Change submission
                </Button>
                <Button
                  variant="ghost"
                  loading={withdraw.isPending}
                  onClick={() => withdraw.mutate(undefined)}
                >
                  <Undo2 /> Take back
                </Button>
              </div>
            )}
          </div>
        ) : canHandIn ? (
          <form onSubmit={handIn} className="space-y-3">
            {phase === 'late' && (
              <p className="rounded-md border border-warning/25 bg-warning-soft px-3 py-2 text-[13px] text-warning">
                The due time has passed. Work handed in now is marked late
                {assignment.lateUntil
                  ? ` (accepted until ${formatInstant(assignment.lateUntil)})`
                  : ''}
                .
              </p>
            )}
            <FilePicker
              files={files}
              onChange={setFiles}
              purpose="submission"
              offeringId={assignment.course.offeringId}
              label="Add files"
            />
            <Field label="Answer or note (optional)" htmlFor="sub-note">
              <Textarea
                id="sub-note"
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Write your answer, or anything your teacher should know."
              />
            </Field>
            <div className="flex justify-end gap-2">
              {mine && (
                <Button variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              )}
              <Button type="submit" loading={submit.pending}>
                <Send /> {mine ? 'Hand in again' : 'Hand in'}
              </Button>
            </div>
          </form>
        ) : (
          !grade && (
            <p className="text-[13.5px] text-muted-foreground">
              {assignment.returned
                ? 'Grades have been returned.'
                : 'Submissions are closed. You did not hand anything in.'}
            </p>
          )
        )}
      </div>
    </Card>
  );
}

type Draft = { obtained: string; feedback: string };

/** The teacher's side: every student, what they handed in, and marks with comments. */
function Submissions({ data }: { data: Detail }) {
  const qc = useQueryClient();
  const { assignment } = data;
  const rows = data.submissions ?? [];
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const draftValue = (studentId: string, field: keyof Draft, saved: string) =>
    drafts[studentId]?.[field] ?? saved;
  const edit = (studentId: string, field: keyof Draft, value: string, saved: Draft) =>
    setDrafts((d) => ({ ...d, [studentId]: { ...(d[studentId] ?? saved), [field]: value } }));
  const savedOf = (row: (typeof rows)[number]): Draft => ({
    obtained: row.obtained === null ? '' : String(row.obtained),
    feedback: row.feedback ?? '',
  });
  const changed = rows.filter((row) => {
    const draft = drafts[row.student.id];
    const saved = savedOf(row);
    return draft && (draft.obtained !== saved.obtained || draft.feedback !== saved.feedback);
  });
  const invalid = changed.some((row) => {
    const value = drafts[row.student.id]?.obtained.trim() ?? '';
    const n = Number(value);
    return value !== '' && (Number.isNaN(n) || n < 0 || n > assignment.total);
  });
  const returnGrades = useAction(
    (returned: boolean) => api.teaching.returnGrades(assignment.id, returned).then(() => returned),
    {
      done: (returned) =>
        returned ? 'Grades returned. Each student was told their mark.' : 'Grades hidden again.',
      invalidate: [keys.coursework, keys.marksSheet(assignment.course.offeringId)],
    },
  );

  const save = async () => {
    setSaving(true);
    try {
      await api.teaching.gradeAssignment(assignment.id, {
        grades: changed.map((row) => {
          const draft = drafts[row.student.id] as Draft;
          const value = draft.obtained.trim();
          return {
            studentId: row.student.id,
            obtained: value === '' ? null : Number(value),
            ...(row.submission ? { feedback: draft.feedback.trim() || null } : {}),
          };
        }),
      });
      toast.success(
        assignment.returned
          ? 'Grades saved. Students whose mark changed were told.'
          : 'Grades saved. Students see them once you return grades.',
      );
      setDrafts({});
      await qc.invalidateQueries({ queryKey: keys.coursework });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title="Submissions"
      description={
        assignment.returned
          ? 'Grades are returned: students see their mark and your comments.'
          : 'Grades stay hidden from students until you return them.'
      }
      actions={
        data.canManage &&
        (assignment.returned ? (
          <Button
            variant="outline"
            loading={returnGrades.isPending}
            onClick={() => returnGrades.mutate(false)}
          >
            Hide grades
          </Button>
        ) : (
          <Button
            loading={returnGrades.isPending}
            disabled={changed.length > 0}
            onClick={() => returnGrades.mutate(true)}
          >
            Return grades
          </Button>
        ))
      }
    >
      <Table>
        <thead>
          <tr>
            <th>Student</th>
            <th>Handed in</th>
            <th>Work</th>
            <th className="w-28">Mark /{assignment.total}</th>
            <th className="min-w-56">Comments</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const saved = savedOf(row);
            const s = row.submission;
            const mark = draftValue(row.student.id, 'obtained', saved.obtained);
            const bad =
              mark.trim() !== '' &&
              (Number.isNaN(Number(mark)) || Number(mark) < 0 || Number(mark) > assignment.total);
            return (
              <tr key={row.student.id}>
                <td>
                  <span className="block font-semibold">{row.student.name}</span>
                  <span className="font-mono text-[12px] text-muted-foreground">
                    {row.student.regNo}
                  </span>
                </td>
                <td className="text-[13px] whitespace-nowrap">
                  {s ? (
                    <span className="flex flex-col gap-0.5">
                      {formatInstant(s.submittedAt)}
                      {s.late && <Badge tone="warning">Late</Badge>}
                    </span>
                  ) : (
                    <Badge tone="danger">Missing</Badge>
                  )}
                </td>
                <td className="max-w-80">
                  {s && (
                    <div className="space-y-1">
                      <FileList files={s.files} />
                      {s.note && (
                        <p className="line-clamp-3 text-[12.5px] whitespace-pre-wrap text-muted-foreground">
                          {s.note}
                        </p>
                      )}
                    </div>
                  )}
                </td>
                <td>
                  {data.canManage ? (
                    <Input
                      aria-label={`Mark for ${row.student.name}`}
                      inputMode="decimal"
                      value={mark}
                      onChange={(e) => edit(row.student.id, 'obtained', e.target.value, saved)}
                      className={cn('h-8 w-20 tabular-nums', bad && 'border-danger')}
                    />
                  ) : (
                    <span className="tabular-nums">{row.obtained ?? '–'}</span>
                  )}
                </td>
                <td>
                  {data.canManage && s ? (
                    <Input
                      aria-label={`Comments for ${row.student.name}`}
                      value={draftValue(row.student.id, 'feedback', saved.feedback)}
                      onChange={(e) => edit(row.student.id, 'feedback', e.target.value, saved)}
                      className="h-8"
                      placeholder="Optional"
                    />
                  ) : (
                    <span className="text-[13px]">{row.feedback}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      {data.canManage && changed.length > 0 && (
        <div className="sticky bottom-3 z-20 m-3 flex flex-wrap items-center gap-3 rounded-lg border bg-surface px-4 py-2.5 shadow-lg">
          <p className="flex-1 text-[13.5px]">
            {invalid
              ? `Marks must be numbers from 0 to ${assignment.total}.`
              : `Unsaved grades for ${changed.length} student${changed.length === 1 ? '' : 's'}.`}
          </p>
          <Button variant="outline" onClick={() => setDrafts({})}>
            Discard
          </Button>
          <Button loading={saving} disabled={invalid} onClick={() => void save()}>
            Save grades
          </Button>
        </div>
      )}
    </Card>
  );
}

export default function AssignmentPage() {
  const { assignmentId = '' } = useParams();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: keys.assignment(assignmentId),
    queryFn: () => api.coursework.assignment(assignmentId),
  });
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const data = query.data;
  const remove = useAction(() => api.teaching.deleteAssignment(assignmentId), {
    done: 'Assignment deleted',
    invalidate: [keys.coursework],
  });

  if (query.isError) {
    return <EmptyState icon={ClipboardList} title="This assignment isn't available to you" />;
  }
  if (!data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  const { assignment, stats } = data;
  // Students get their own work; teachers and those overseeing the course get every student's.
  const student = !data.submissions;
  return (
    <>
      <PageHeader
        title={assignment.title}
        description={
          <Link
            to={`/academics/coursework/${assignment.course.offeringId}`}
            className="hover:underline"
          >
            {assignment.course.code} {assignment.course.title}
            {assignment.course.sectionName ? ` · ${assignment.course.sectionName}` : ''}
          </Link>
        }
        actions={
          data.canManage ? (
            <>
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil /> Edit
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="More options">
                    <Ellipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem danger onSelect={() => setRemoving(true)}>
                    <Trash2 /> Delete assignment
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : undefined
        }
      />
      <StatStrip className={cn('mb-5 sm:grid-cols-3', stats ? 'xl:grid-cols-6' : 'xl:grid-cols-3')}>
        <Stat
          label="Due"
          value={<span className="text-[16px]">{formatInstant(assignment.dueAt)}</span>}
          hint={<DueText dueAt={assignment.dueAt} lateUntil={assignment.lateUntil} short />}
        />
        <Stat label="Marks" value={assignment.total} />
        <Stat
          label="Late work"
          value={
            <span className="text-[16px]">
              {assignment.lateUntil
                ? `Until ${formatInstant(assignment.lateUntil)}`
                : 'Not accepted'}
            </span>
          }
        />
        {stats && (
          <>
            <Stat label="Handed in" value={`${stats.submitted}/${stats.enrolled}`} />
            <Stat label="Late" value={stats.late} />
            <Stat label="Graded" value={stats.graded} />
          </>
        )}
      </StatStrip>
      <div
        className={cn(
          'grid items-start gap-5',
          student && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]',
        )}
      >
        <div className="min-w-0 space-y-5">
          <Card title="Instructions">
            <div className="space-y-3 p-4">
              <p className="text-[14px] whitespace-pre-wrap">
                {assignment.instructions || 'No written instructions.'}
              </p>
              <FileList files={assignment.attachments} />
            </div>
          </Card>
          {data.submissions && <Submissions data={data} />}
        </div>
        {student && <YourWork key={data.mine?.submittedAt ?? 'none'} data={data} />}
      </div>

      {editing && (
        <AssignmentDialog
          offeringId={assignment.course.offeringId}
          assignment={assignment}
          onClose={() => setEditing(false)}
        />
      )}
      <Dialog open={removing} onOpenChange={setRemoving}>
        <DialogContent
          title={`Delete ${assignment.title}?`}
          description="Every submission, its files and the marks column are deleted too. This can't be undone."
        >
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRemoving(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() =>
                remove.mutate(undefined, {
                  onSuccess: () =>
                    navigate(`/academics/coursework/${assignment.course.offeringId}`),
                })
              }
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
