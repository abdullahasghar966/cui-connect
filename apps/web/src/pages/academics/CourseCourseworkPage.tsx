import {
  type AssignmentSummaryDTO,
  type CourseworkCourseDTO,
  formatBytes,
  type MaterialDTO,
  type QuizSummaryDTO,
  submissionWindow,
} from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight,
  ClipboardList,
  Ellipsis,
  ExternalLink,
  FileUp,
  Library,
  NotebookPen,
  Plus,
  Trash2,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { fileIcon } from '@/components/coursework/files';
import { EmptyState, Spinner } from '@/components/feedback';
import { Card, PageHeader, Tabs } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/menu';
import { useAction } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import {
  AssignmentDialog,
  DueText,
  LiveQuizBanner,
  MaterialDialog,
  QuizBadge,
  STATE_BADGE,
} from './coursework-ui';

const TABS = ['assignments', 'materials', 'quizzes'] as const;
type Tab = (typeof TABS)[number];

function AssignmentList({ data }: { data: CourseworkCourseDTO }) {
  const open = (a: AssignmentSummaryDTO) => submissionWindow(a) !== 'closed';
  const groups: [string, AssignmentSummaryDTO[]][] = [
    ['Open', data.assignments.filter(open)],
    ['Closed', data.assignments.filter((a) => !open(a)).reverse()],
  ];
  if (!data.assignments.length) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No assignments yet"
        className="rounded-lg border bg-surface"
      >
        {data.canManage
          ? 'Set one with “New assignment”.'
          : 'Assignments your teacher sets appear here.'}
      </EmptyState>
    );
  }
  return (
    <div className="space-y-5">
      {groups
        .filter(([, list]) => list.length)
        .map(([label, list]) => (
          <Card key={label} title={label}>
            <ul className="divide-y">
              {list.map((a) => {
                const badge = a.state ? STATE_BADGE[a.state] : null;
                return (
                  <li key={a.id}>
                    <Link
                      to={`/academics/assignments/${a.id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14.5px] font-bold">{a.title}</span>
                        <DueText dueAt={a.dueAt} lateUntil={a.lateUntil} />
                        <span className="text-[13px] text-muted-foreground">
                          {' '}
                          · {a.total} marks
                        </span>
                      </span>
                      {data.canManage ? (
                        <span className="flex items-center gap-2">
                          {a.returned && <Badge tone="success">Grades returned</Badge>}
                          <span className="text-[13px] text-muted-foreground tabular-nums">
                            <b className="text-foreground">{a.submitted}</b>/{a.enrolled} handed in
                          </span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          {a.obtained !== null && (
                            <span className="text-[14px] font-bold tabular-nums">
                              {a.obtained}/{a.total}
                            </span>
                          )}
                          {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
                        </span>
                      )}
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
    </div>
  );
}

function MaterialRow({ m, canManage }: { m: MaterialDTO; canManage: boolean }) {
  const remove = useAction(() => api.teaching.deleteMaterial(m.id), {
    done: 'Material removed',
    invalidate: [keys.coursework],
  });
  const Icon = m.file ? fileIcon(m.file.name) : ExternalLink;
  const href = m.file?.url ?? m.url ?? '#';
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-[14px] font-semibold hover:underline"
        >
          {m.title}
        </a>
        <span className="block truncate text-[12.5px] text-muted-foreground">
          {m.file
            ? `${m.file.name} · ${formatBytes(m.file.size)}`
            : m.url
              ? new URL(m.url).host
              : ''}
          {m.description ? ` · ${m.description}` : ''}
        </span>
      </span>
      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Options for ${m.title}`}>
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem danger onSelect={() => remove.mutate(undefined)}>
              <Trash2 /> Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}

function MaterialList({ data }: { data: CourseworkCourseDTO }) {
  const weeks = new Map<number, MaterialDTO[]>();
  for (const m of data.materials) weeks.set(m.week, [...(weeks.get(m.week) ?? []), m]);
  if (!weeks.size) {
    return (
      <EmptyState icon={Library} title="No materials yet" className="rounded-lg border bg-surface">
        {data.canManage
          ? 'Share slides, notes and links with “Add material”.'
          : 'Slides, notes and links from your teacher appear here, week by week.'}
      </EmptyState>
    );
  }
  return (
    <div className="space-y-4">
      {[...weeks.entries()].map(([week, list]) => (
        <section key={week} aria-label={`Week ${week}`}>
          <h2 className="mb-1.5 text-[14px] font-bold">Week {week}</h2>
          <ul className="divide-y overflow-hidden rounded-lg border bg-surface">
            {list.map((m) => (
              <MaterialRow key={m.id} m={m} canManage={data.canManage} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function QuizList({ data }: { data: CourseworkCourseDTO }) {
  if (!data.quizzes.length) {
    return (
      <EmptyState icon={Zap} title="No quizzes yet" className="rounded-lg border bg-surface">
        {data.canManage
          ? 'Write a quiz, then run it live in class: students answer on their phones.'
          : 'When your teacher runs a live quiz, it appears here and you are told.'}
      </EmptyState>
    );
  }
  return (
    <ul className="divide-y overflow-hidden rounded-lg border bg-surface">
      {data.quizzes.map((q: QuizSummaryDTO) => (
        <li key={q.id}>
          <Link
            to={`/academics/quizzes/${q.id}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-bold">{q.title}</span>
              <span className="text-[13px] text-muted-foreground">
                {q.questionCount} question{q.questionCount === 1 ? '' : 's'} · {q.totalPoints}{' '}
                points
                {data.canManage && q.status !== 'draft' ? ` · ${q.participants} took part` : ''}
              </span>
            </span>
            {q.myScore !== null && (
              <span className="text-[14px] font-bold tabular-nums">
                {q.myScore}/{q.totalPoints}
              </span>
            )}
            {data.canManage && q.savedToMarks && <Badge tone="success">In marks</Badge>}
            <QuizBadge status={q.status} />
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** One course's coursework: assignments, materials by week and live quizzes. */
export default function CourseCourseworkPage() {
  const { offeringId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(params.get('tab') ?? '')
    ? (params.get('tab') as Tab)
    : 'assignments';
  const query = useQuery({
    queryKey: keys.courseworkCourse(offeringId),
    queryFn: () => api.coursework.course(offeringId),
  });
  const [dialog, setDialog] = useState<'assignment' | 'material' | null>(null);
  const data = query.data;

  if (query.isError) {
    return (
      <EmptyState icon={ClipboardList} title="This course's coursework isn't available to you" />
    );
  }
  if (!data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  const live = data.quizzes.filter((q) => q.status === 'live');
  return (
    <>
      <PageHeader
        title={`${data.course.code} ${data.course.title}`}
        description={`Coursework${data.course.sectionName ? ` · ${data.course.sectionName}` : ''}`}
        actions={
          data.canManage ? (
            <>
              <Button onClick={() => setDialog('assignment')}>
                <Plus /> New assignment
              </Button>
              <Button variant="outline" onClick={() => setDialog('material')}>
                <FileUp /> Add material
              </Button>
              <Link
                to={`/academics/quizzes/new?course=${offeringId}`}
                className={buttonVariants({ variant: 'outline' })}
              >
                <Zap /> New quiz
              </Link>
              <Link
                to={`/academics/marks/${offeringId}`}
                className={buttonVariants({ variant: 'ghost' })}
              >
                <NotebookPen /> Marks sheet
              </Link>
            </>
          ) : undefined
        }
      />
      {live.length > 0 && (
        <div className="mb-4 space-y-2">
          {live.map((quiz) => (
            <LiveQuizBanner key={quiz.id} quiz={quiz} host={data.canManage} />
          ))}
        </div>
      )}
      <Tabs
        label="Coursework"
        value={tab}
        onChange={(value) => setParams({ tab: value }, { replace: true })}
        options={[
          { value: 'assignments', label: 'Assignments', count: data.assignments.length },
          { value: 'materials', label: 'Materials', count: data.materials.length },
          { value: 'quizzes', label: 'Quizzes', count: data.quizzes.length },
        ]}
      />
      {tab === 'assignments' && <AssignmentList data={data} />}
      {tab === 'materials' && <MaterialList data={data} />}
      {tab === 'quizzes' && <QuizList data={data} />}
      {dialog === 'assignment' && (
        <AssignmentDialog offeringId={offeringId} onClose={() => setDialog(null)} />
      )}
      {dialog === 'material' && (
        <MaterialDialog offeringId={offeringId} onClose={() => setDialog(null)} />
      )}
    </>
  );
}
