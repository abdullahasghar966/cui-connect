import type { PlanCourseStatus } from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck, CircleDashed, CircleDot, CircleX, Route } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { EmptyState, Spinner } from '@/components/feedback';
import { PageHeader, Stat, StatStrip } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { useCurrentUser } from '@/hooks/queries';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { fixed, looksUpStudents, RecordTabs, StudentPicker } from './records-ui';

const STATUS: Record<
  PlanCourseStatus,
  { label: string; icon: typeof CircleCheck; className: string }
> = {
  passed: { label: 'Passed', icon: CircleCheck, className: 'text-primary dark:text-link' },
  failed: { label: 'Needs a retake', icon: CircleX, className: 'text-danger' },
  current: { label: 'This term', icon: CircleDot, className: 'text-warning' },
  planned: { label: 'Still to take', icon: CircleDashed, className: 'text-muted-foreground' },
};

/** The degree plan, semester by semester, with what's done and what's left. */
export default function ProgressPage() {
  const me = useCurrentUser();
  const [params] = useSearchParams();
  const studentId = params.get('student') ?? undefined;
  const staff = looksUpStudents(me);
  const query = useQuery({
    queryKey: ['academics', 'progress', studentId ?? 'me'],
    queryFn: () => api.academics.progress(studentId),
    enabled: !staff || !!studentId,
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
  });
  const data = query.data;
  const all = data?.semesters.flatMap((s) => s.courses) ?? [];
  const total = data?.program?.totalCredits ?? 0;
  const done = Math.min(100, total ? Math.round((100 * (data?.creditsEarned ?? 0)) / total) : 0);
  const doing = Math.min(
    100 - done,
    total ? Math.round((100 * (data?.creditsInProgress ?? 0)) / total) : 0,
  );

  return (
    <>
      <PageHeader
        title="Degree progress"
        description="Your degree plan, semester by semester. A failed course stays marked until it's passed again."
      />
      <RecordTabs me={me} />
      {staff && <StudentPicker current={data?.student ?? null} />}

      {staff && !studentId ? (
        <EmptyState
          icon={Route}
          title="Choose a student"
          className="rounded-lg border bg-surface"
        />
      ) : query.isPending ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !data ? (
        <EmptyState icon={Route} title="Can't open this record">
          {query.error instanceof ApiError ? query.error.message : 'Try again in a moment.'}
        </EmptyState>
      ) : !data.program ? (
        <EmptyState icon={Route} title="No degree plan for this programme yet">
          IT or the department adds degree plans in Admin › Academic setup.
        </EmptyState>
      ) : (
        <>
          <div className="mb-4">
            <StatStrip className="xl:grid-cols-4">
              <Stat label="Programme" value={data.program.code} hint={data.program.name} />
              <Stat
                label="Credits earned"
                value={`${data.creditsEarned} / ${data.program.totalCredits}`}
                hint={`${data.creditsInProgress} in progress`}
              />
              <Stat label="CGPA" value={fixed(data.cgpa)} />
              <Stat
                label="Semester"
                value={data.currentSemester ?? '–'}
                hint={`${all.filter((c) => c.status === 'planned').length} courses still to take`}
              />
            </StatStrip>
          </div>
          <div
            className="mb-6 flex h-2.5 overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={`${done}% of the credits earned, ${doing}% in progress`}
          >
            <div className="bg-primary" style={{ width: `${done}%` }} />
            <div className="bg-warning/70" style={{ width: `${doing}%` }} />
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {data.semesters.map((s) => (
              <section
                key={s.semester}
                aria-label={`Semester ${s.semester}`}
                className={cn(
                  'rounded-lg border bg-surface',
                  s.semester === data.currentSemester && 'border-warning/50',
                )}
              >
                <h2 className="flex items-center justify-between border-b px-3 py-2 text-[13.5px] font-bold">
                  Semester {s.semester}
                  {s.semester === data.currentSemester && <Badge tone="warning">Now</Badge>}
                </h2>
                <ul className="divide-y">
                  {s.courses.map((c) => {
                    const status = STATUS[c.status];
                    const Icon = status.icon;
                    return (
                      <li key={c.code} className="flex items-start gap-2 px-3 py-1.5 text-[13px]">
                        <Icon
                          className={cn('mt-0.5 size-4 shrink-0', status.className)}
                          aria-label={status.label}
                        />
                        <Link
                          to={`/academics/courses/${c.code}`}
                          className="min-w-0 flex-1 hover:underline"
                        >
                          <span className="font-mono text-[12px] text-muted-foreground">
                            {c.code}
                          </span>{' '}
                          {c.title}
                        </Link>
                        <span className="shrink-0 text-[12px] font-semibold tabular-nums">
                          {c.grade ?? `${c.credits} cr`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>

          {data.outsidePlan.length > 0 && (
            <section className="mt-5">
              <h2 className="mb-2 text-[14px] font-bold">Also passed (outside the plan)</h2>
              <p className="flex flex-wrap gap-1.5">
                {data.outsidePlan.map((c) => (
                  <Badge key={c.code} tone="outline">
                    {c.code} {c.title} · {c.grade}
                  </Badge>
                ))}
              </p>
            </section>
          )}
          <p className="mt-5 flex flex-wrap gap-4 text-[12px] text-muted-foreground">
            {Object.entries(STATUS).map(([key, s]) => (
              <span key={key} className="inline-flex items-center gap-1.5">
                <s.icon className={cn('size-3.5', s.className)} aria-hidden /> {s.label}
              </span>
            ))}
          </p>
        </>
      )}
    </>
  );
}
