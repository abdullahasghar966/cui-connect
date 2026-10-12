import type { AssignmentSummaryDTO, CourseworkOverviewDTO } from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { BookOpenCheck, ChevronRight, PartyPopper } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState, Spinner } from '@/components/feedback';
import { Card, PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { useCurrentUser } from '@/hooks/queries';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { DueText, LiveQuizBanner, STATE_BADGE } from './coursework-ui';

function AssignmentRow({ a, teacher }: { a: AssignmentSummaryDTO; teacher: boolean }) {
  const badge = a.state ? STATE_BADGE[a.state] : null;
  return (
    <li>
      <Link
        to={`/academics/assignments/${a.id}`}
        className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-semibold text-muted-foreground">
            {a.course.code} {a.course.title}
            {teacher && a.course.sectionName ? ` · ${a.course.sectionName}` : ''}
          </span>
          <span className="block truncate text-[14.5px] font-bold">{a.title}</span>
          <DueText dueAt={a.dueAt} lateUntil={a.lateUntil} />
        </span>
        {teacher ? (
          <span className="text-right text-[13px] text-muted-foreground tabular-nums">
            <span className="block text-[16px] font-bold text-foreground">
              {a.submitted}/{a.enrolled}
            </span>
            handed in
          </span>
        ) : (
          badge && <Badge tone={badge.tone}>{badge.label}</Badge>
        )}
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

function Courses({ data, teacher }: { data: CourseworkOverviewDTO; teacher: boolean }) {
  return (
    <Card title="Your courses">
      {data.courses.length ? (
        <ul className="divide-y">
          {data.courses.map((c) => (
            <li key={c.course.offeringId}>
              <Link
                to={`/academics/coursework/${c.course.offeringId}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="font-mono text-[12px] font-semibold text-muted-foreground">
                    {c.course.code}
                    {teacher && c.course.sectionName ? ` · ${c.course.sectionName}` : ''}
                  </span>
                  <span className="block truncate text-[14.5px] font-bold">{c.course.title}</span>
                  <span className="text-[12.5px] text-muted-foreground">
                    {c.assignments} assignment{c.assignments === 1 ? '' : 's'} · {c.materials}{' '}
                    material{c.materials === 1 ? '' : 's'}
                  </span>
                </span>
                {c.pending > 0 && (
                  <Badge tone={teacher ? 'warning' : 'primary'}>
                    {teacher ? `${c.pending} to grade` : `${c.pending} to do`}
                  </Badge>
                )}
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={BookOpenCheck} title="No courses this term" className="py-8" />
      )}
    </Card>
  );
}

/** Students: what's due and each course's work. Teachers: their courses and open assignments. */
export default function CourseworkPage() {
  const me = useCurrentUser();
  const teacher = me.role === 'faculty';
  const query = useQuery({ queryKey: keys.coursework, queryFn: api.coursework.overview });
  const data = query.data;
  return (
    <>
      <PageHeader
        title="Coursework"
        description={
          teacher
            ? 'Set assignments, share materials by week and run live quizzes in your courses.'
            : 'Assignments to hand in, course materials and live quizzes for your courses.'
        }
      />
      {!data ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-5">
          {data.live.map((quiz) => (
            <LiveQuizBanner key={quiz.id} quiz={quiz} host={teacher} />
          ))}
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
            <Card title={teacher ? 'Open assignments' : 'Due soon'}>
              {data.upcoming.length ? (
                <ul className="divide-y">
                  {data.upcoming.map((a) => (
                    <AssignmentRow key={a.id} a={a} teacher={teacher} />
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon={PartyPopper}
                  title={teacher ? 'No open assignments' : 'Nothing to hand in right now'}
                  className="py-8"
                >
                  {teacher
                    ? 'Open a course to set one.'
                    : 'New assignments from your teachers show up here.'}
                </EmptyState>
              )}
            </Card>
            <Courses data={data} teacher={teacher} />
          </div>
        </div>
      )}
    </>
  );
}
