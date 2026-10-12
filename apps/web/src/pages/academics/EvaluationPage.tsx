import { type EvaluationHomeDTO, MIN_EVALUATION_RESPONSES } from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck, EyeOff, LockKeyhole, Search, ShieldCheck, Star } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { EmptyState, Spinner } from '@/components/feedback';
import { Card, PageHeader, Table } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { useCurrentUser } from '@/hooks/queries';
import { useAction } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { cn } from '@/lib/utils';

/** Students evaluate their courses; teachers, HODs, the Director's Office and IT read results. */
export default function EvaluationPage() {
  const me = useCurrentUser();
  const query = useQuery({ queryKey: keys.evaluation, queryFn: api.evaluation.home });
  const data = query.data;
  const toggle = useAction((open: boolean) => api.evaluation.setWindow(open), {
    done: (r) =>
      r.open
        ? 'Evaluation is open. Students were told.'
        : 'Evaluation is closed. Teachers were told their results are ready.',
    invalidate: [keys.evaluation],
  });
  const student = me.role === 'student';
  return (
    <>
      <PageHeader
        title="Teacher evaluation"
        description={
          student
            ? 'Tell the university how each of your courses went. Your answers are anonymous.'
            : 'What students said about each course. Results appear after evaluation closes.'
        }
        actions={
          data?.canChangeWindow && (
            <Button
              variant={data.open ? 'outline' : 'primary'}
              loading={toggle.isPending}
              onClick={() => toggle.mutate(!data.open)}
            >
              {data.open ? 'Close evaluation' : 'Open evaluation'}
            </Button>
          )
        }
      />
      {!data ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <>
          <p
            className={cn(
              'mb-5 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[13.5px]',
              data.open ? 'border-primary/25 bg-primary-soft' : 'bg-surface-2',
            )}
          >
            {data.open ? (
              <Star className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            ) : (
              <LockKeyhole className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            {data.open
              ? `Evaluation for ${data.term.name} is open.`
              : `Evaluation for ${data.term.name} is closed.`}
          </p>
          {student ? <StudentCourses data={data} /> : <Results data={data} />}
        </>
      )}
    </>
  );
}

function StudentCourses({ data }: { data: EvaluationHomeDTO }) {
  const left = data.courses.filter((c) => !c.done).length;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card
        title="Your courses"
        description={
          data.courses.length
            ? left
              ? `${left} of ${data.courses.length} still to evaluate.`
              : 'All done. Thank you.'
            : undefined
        }
      >
        {!data.courses.length ? (
          <p className="px-4 py-6 text-[13.5px] text-muted-foreground">
            You have no courses to evaluate this term.
          </p>
        ) : (
          <ul className="divide-y">
            {data.courses.map((c) => (
              <li key={c.offeringId} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px]">
                    <span className="font-mono text-[12.5px] text-muted-foreground">{c.code}</span>{' '}
                    <span className="font-semibold">{c.title}</span>
                  </span>
                  <span className="text-[12.5px] text-muted-foreground">
                    {c.teacher?.name} · {c.sectionName}
                  </span>
                </span>
                {c.done ? (
                  <Badge tone="success">
                    <CircleCheck /> Evaluated
                  </Badge>
                ) : data.open ? (
                  <Link
                    to={`/academics/evaluation/${c.offeringId}`}
                    className={buttonVariants({ size: 'sm' })}
                    aria-label={`Evaluate ${c.code} ${c.title}`}
                  >
                    Evaluate
                  </Link>
                ) : (
                  <Badge tone="outline">Closed</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="How your answers stay anonymous">
        <ul className="space-y-2.5 px-4 py-3 text-[13px]">
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            Your answers are saved without your name, ID or the time you sent them.
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            Only a separate note that you've answered is kept, so you can't answer twice.
          </li>
          <li className="flex gap-2">
            <EyeOff className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            Teachers see results only after evaluation closes, and only when at least{' '}
            {MIN_EVALUATION_RESPONSES} students answered.
          </li>
        </ul>
      </Card>
    </div>
  );
}

function Results({ data }: { data: EvaluationHomeDTO }) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const rows = data.rows.filter(
    (r) =>
      !needle ||
      r.code.toLowerCase().includes(needle) ||
      r.title.toLowerCase().includes(needle) ||
      (r.teacher?.name.toLowerCase().includes(needle) ?? false) ||
      r.sectionName.toLowerCase().includes(needle),
  );
  if (!data.rows.length) {
    return (
      <EmptyState icon={Star} title="No courses to show" className="rounded-lg border bg-surface">
        Results of the courses you teach (or oversee) appear here.
      </EmptyState>
    );
  }
  return (
    <>
      {data.rows.length > 8 && (
        <div className="relative mb-4 max-w-sm">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Search courses"
            placeholder="Course, teacher or section"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>
      )}
      <Card>
        {/* Phones: one row per course instead of a wide table. */}
        <ul className="divide-y sm:hidden">
          {rows.map((r) => (
            <li key={r.offeringId}>
              <Link
                to={`/academics/evaluation/${r.offeringId}/report`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1 text-[13px]">
                  <span className="block text-[14px]">
                    <span className="font-mono text-[12px] text-muted-foreground">{r.code}</span>{' '}
                    <span className="font-semibold">{r.title}</span>
                  </span>
                  <span className="text-muted-foreground">
                    {r.teacher?.name ?? '—'} · {r.sectionName} · {r.responses} of {r.enrolled}{' '}
                    answered
                  </span>
                </span>
                <span className="shrink-0 text-right text-[13px] font-bold tabular-nums">
                  {r.overall === null ? (
                    <span className="font-normal text-muted-foreground">Hidden</span>
                  ) : (
                    `${r.overall.toFixed(1)} / 5`
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="hidden sm:block">
          <Table>
            <thead>
              <tr>
                <th scope="col">Course</th>
                <th scope="col">Teacher</th>
                <th scope="col" className="text-right">
                  Answers
                </th>
                <th scope="col" className="text-right">
                  Overall
                </th>
                <th scope="col">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.offeringId}>
                  <td>
                    <span className="font-mono text-[12px] text-muted-foreground">{r.code}</span>{' '}
                    <span className="font-semibold">{r.title}</span>
                    <span className="block text-[12px] text-muted-foreground">{r.sectionName}</span>
                  </td>
                  <td className="whitespace-nowrap">{r.teacher?.name ?? '—'}</td>
                  <td className="text-right whitespace-nowrap tabular-nums">
                    {r.responses} / {r.enrolled}
                  </td>
                  <td className="text-right whitespace-nowrap tabular-nums">
                    {r.overall === null ? (
                      <span className="text-muted-foreground">Hidden</span>
                    ) : (
                      <span className="font-bold">{r.overall.toFixed(1)} / 5</span>
                    )}
                  </td>
                  <td className="text-right">
                    <Link
                      to={`/academics/evaluation/${r.offeringId}/report`}
                      className={buttonVariants({ size: 'sm', variant: 'outline' })}
                      aria-label={`Results for ${r.code} ${r.sectionName}`}
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Card>
    </>
  );
}
