import {
  ASSESSMENT_LABELS,
  formatShortDate,
  type StudentCourseResultDTO,
  type TermResultDTO,
} from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, GraduationCap, NotebookPen } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { EmptyState, Spinner } from '@/components/feedback';
import { PageHeader, Stat, StatStrip } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/queries';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { cn } from '@/lib/utils';
import { fixed, gradeTone, RecordTabs, WhatIfPanel } from './records-ui';

function CourseResult({ result }: { result: StudentCourseResultDTO }) {
  const [open, setOpen] = useState(false);
  const shown = result.final ?? result.projected;
  const { standing } = result;
  return (
    <section
      aria-label={`${result.course.code} ${result.course.title}`}
      className="overflow-hidden rounded-lg border bg-surface"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-4 px-4 py-3.5 text-left hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1">
          <span className="font-mono text-[12.5px] font-semibold text-muted-foreground">
            {result.course.code}
          </span>
          <span className="block truncate text-[15px] font-bold">{result.course.title}</span>
          <span className="block text-[12.5px] text-muted-foreground">
            {result.credits} credit hours · {standing.completedWeight}% of the course assessed
          </span>
        </span>
        <span className="text-right">
          <span
            className={cn(
              'block text-[24px] leading-none font-bold',
              shown ? gradeTone(shown.points) : 'text-muted-foreground',
            )}
          >
            {shown?.grade ?? '–'}
          </span>
          <span className="mt-1 block text-[12px] text-muted-foreground">
            {result.final ? (
              <Badge tone="primary">Final</Badge>
            ) : shown ? (
              `Projected · ${shown.percent}%`
            ) : (
              'No marks yet'
            )}
          </span>
        </span>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div className="border-t">
          <table className="w-full text-[13px]">
            <caption className="sr-only">Breakdown by component</caption>
            <thead className="bg-surface-2 text-[12px] text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2 text-left font-semibold">
                  Component
                </th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">
                  Weight
                </th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">
                  Your average
                </th>
                <th scope="col" className="px-4 py-2 text-right font-semibold">
                  Points
                </th>
              </tr>
            </thead>
            <tbody>
              {standing.byType.map((part) => (
                <tr key={part.type} className="border-t">
                  <td className="px-4 py-2">{ASSESSMENT_LABELS[part.type]}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{part.weight}%</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {part.average === null ? (
                      <span className="text-muted-foreground">Not yet</span>
                    ) : (
                      `${Math.round(part.average * 1000) / 10}%`
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">
                    {part.earned === null ? '–' : `${part.earned} / ${part.weight}`}
                  </td>
                </tr>
              ))}
              <tr className="border-t bg-surface-2 font-semibold">
                <td className="px-4 py-2">So far</td>
                <td className="px-2 py-2 text-right tabular-nums">{standing.completedWeight}%</td>
                <td />
                <td className="px-4 py-2 text-right tabular-nums">
                  {standing.earned} / {standing.completedWeight}
                </td>
              </tr>
            </tbody>
          </table>

          {!result.final && <WhatIfPanel standing={standing} />}

          {result.assessments.length > 0 && (
            <ul aria-label="Marks" className="divide-y border-t">
              {result.assessments.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-2 text-[13px]">
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{a.title}</span>
                    <span className="text-muted-foreground">
                      {' '}
                      · {ASSESSMENT_LABELS[a.type]}
                      {a.date ? ` · ${formatShortDate(a.date)}` : ''}
                    </span>
                  </span>
                  <span className="text-[12px] text-muted-foreground tabular-nums">
                    class avg {a.classAverage ?? '–'}
                  </span>
                  <span className="w-16 text-right font-bold tabular-nums">
                    {a.obtained ?? '–'} / {a.total}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function History({ terms }: { terms: TermResultDTO[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!terms.length) return null;
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-[15px] font-bold">Earlier terms</h2>
      <ul className="divide-y overflow-hidden rounded-lg border bg-surface">
        {terms.map((t) => (
          <li key={t.term.code}>
            <button
              type="button"
              aria-expanded={open === t.term.code}
              onClick={() => setOpen(open === t.term.code ? null : t.term.code)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2"
            >
              <span className="flex-1 text-[14px] font-semibold">{t.term.name}</span>
              <span className="text-[12.5px] text-muted-foreground">{t.credits} credit hours</span>
              <span className="w-24 text-right text-[14px] font-bold tabular-nums">
                GPA {fixed(t.gpa)}
              </span>
              <ChevronDown
                className={cn(
                  'size-4 text-muted-foreground transition-transform',
                  open === t.term.code && 'rotate-180',
                )}
                aria-hidden
              />
            </button>
            {open === t.term.code && (
              <table className="w-full border-t text-[13px]">
                <caption className="sr-only">{t.term.name} grades</caption>
                <tbody>
                  {t.courses.map((c) => (
                    <tr key={c.code} className="border-t first:border-t-0">
                      <td className="w-20 px-4 py-1.5 font-mono text-[12.5px] text-muted-foreground">
                        {c.code}
                      </td>
                      <td className="py-1.5">{c.title}</td>
                      <td className="px-2 py-1.5 text-right text-muted-foreground tabular-nums">
                        {c.credits} cr
                      </td>
                      <td
                        className={cn('w-12 px-2 py-1.5 text-right font-bold', gradeTone(c.points))}
                      >
                        {c.grade}
                      </td>
                      <td className="w-16 px-4 py-1.5 text-right tabular-nums">
                        {c.points.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function MyResults() {
  const { data, isPending } = useQuery({ queryKey: keys.results, queryFn: api.academics.results });
  if (isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (!data) return <EmptyState icon={GraduationCap} title="Results are not available" />;
  return (
    <>
      <PageHeader
        title="Results"
        description={`${data.term.name}. Marks appear when your teacher publishes them; grades are projections until they're final.`}
      />
      <RecordTabs me={{ role: 'student' }} />
      <div className="mb-5">
        <StatStrip className="xl:grid-cols-4">
          <Stat label="CGPA" value={fixed(data.cgpa)} hint="Official, all terms" />
          <Stat label="Projected GPA" value={fixed(data.projectedGpa)} hint={data.term.name} />
          <Stat label="Credits earned" value={data.creditsEarned} />
          <Stat label="Courses this term" value={data.courses.length} />
        </StatStrip>
      </div>
      {data.courses.length ? (
        <div className="space-y-3">
          {data.courses.map((c) => (
            <CourseResult key={c.course.offeringId} result={c} />
          ))}
        </div>
      ) : (
        <EmptyState icon={GraduationCap} title="No courses this term" />
      )}
      <History terms={data.history} />
    </>
  );
}

function TeacherMarks() {
  const { data, isPending } = useQuery({
    queryKey: keys.teachingCourses,
    queryFn: api.teaching.courses,
  });
  return (
    <>
      <PageHeader
        title="Marks"
        description="Enter marks, publish each assessment when it's ready (students are told their own score), and finalise grades at the end of the term."
      />
      {isPending ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !data?.length ? (
        <EmptyState icon={NotebookPen} title="You don't teach a course this term" />
      ) : (
        <ul
          aria-label="Your courses"
          className="divide-y overflow-hidden rounded-lg border bg-surface"
        >
          {data.map((c) => (
            <li key={c.course.offeringId} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-bold">
                  <span className="font-mono text-[12.5px] text-muted-foreground">
                    {c.course.code}
                  </span>{' '}
                  {c.course.title} · {c.course.sectionName}
                </span>
                <span className="block text-[12.5px] text-muted-foreground">
                  {c.enrolled} students · {c.marks.assessments} assessment
                  {c.marks.assessments === 1 ? '' : 's'}, {c.marks.published} published
                </span>
              </span>
              {c.marks.finalized && <Badge tone="primary">Grades final</Badge>}
              <Link
                to={`/academics/marks/${c.course.offeringId}`}
                className={buttonVariants({ variant: 'outline' })}
              >
                <NotebookPen /> Open marks
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Students see their marks and GPA; teachers open the marks of their courses. */
export default function ResultsPage() {
  const me = useCurrentUser();
  if (me.role === 'student') return <MyResults />;
  if (me.role === 'faculty') return <TeacherMarks />;
  return (
    <>
      <PageHeader title="Results" />
      <EmptyState icon={GraduationCap} title="Marks are entered by each course's teacher">
        HODs, the Examination Office and IT can open any course's marks from its course page
        (Academics › Courses).
      </EmptyState>
    </>
  );
}
