import {
  ASSESSMENT_LABELS,
  ASSESSMENT_TYPES,
  type CourseSectionDTO,
  DEFAULT_GRADING,
  formatCredits,
  formatTimeRange,
  GRADE_SCALE,
  WEEKDAY_SHORT,
  type Weekday,
} from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  MessagesSquare,
  NotebookPen,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { EmptyState, Spinner } from '@/components/feedback';
import { Card } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { ApiError, api } from '@/lib/api';
import { keys } from '@/lib/cache';

function SideBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b px-4 py-3.5 last:border-b-0">
      <h2 className="mb-2 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

function CourseLink({ code, title }: { code: string; title: string | null }) {
  return title ? (
    <Link to={`/academics/courses/${code}`} className="group block py-0.5 text-[13.5px]">
      <span className="font-mono text-[12.5px] font-semibold text-link group-hover:underline">
        {code}
      </span>{' '}
      <span>{title}</span>
    </Link>
  ) : (
    <span className="block py-0.5 font-mono text-[12.5px] font-semibold">{code}</span>
  );
}

function SectionRow({ section }: { section: CourseSectionDTO }) {
  const seats =
    section.capacity === null
      ? `${section.enrolled} enrolled`
      : `${section.enrolled} / ${section.capacity} seats`;
  return (
    <li className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-[14.5px] font-bold">{section.sectionName ?? 'Section'}</span>
          {section.mine && <Badge tone="primary">Your section</Badge>}
          <span className="text-[13px] text-muted-foreground">
            {section.instructor?.name ?? 'No instructor yet'} · {seats}
          </span>
        </p>
        {section.schedule.length ? (
          <ul className="mt-1.5 space-y-0.5 text-[13px] text-muted-foreground">
            {section.schedule.map((s) => (
              <li key={`${s.day}-${s.start}`} className="tabular-nums">
                <span className="inline-block w-9 font-semibold text-foreground">
                  {WEEKDAY_SHORT[s.day as Weekday]}
                </span>
                {formatTimeRange(s.start, s.end)}
                {s.kind === 'lab' ? ' · Lab' : ''} · {s.room?.name ?? 'Room TBA'}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-[13px] text-muted-foreground">Not on the timetable yet.</p>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        <Link
          to={`/academics/timetable?view=section&id=${section.sectionId}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <CalendarDays /> Timetable
        </Link>
        {section.canViewRecords && (
          <Link
            to={`/academics/attendance/course/${section.offeringId}`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <ClipboardCheck /> Attendance
          </Link>
        )}
        {section.canViewRecords && (
          <Link
            to={`/academics/marks/${section.offeringId}`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <NotebookPen /> Marks
          </Link>
        )}
        {section.groupId && (
          <Link
            to={`/chat/${section.groupId}`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <MessagesSquare /> Open chat
          </Link>
        )}
      </div>
    </li>
  );
}

function Grading({ sections }: { sections: CourseSectionDTO[] }) {
  const reference = sections.find((s) => s.mine) ?? sections[0];
  const weights = reference?.grading ?? DEFAULT_GRADING;
  const parts = ASSESSMENT_TYPES.filter((type) => weights[type] > 0);
  const differs = sections.some((s) => s.customGrading);
  return (
    <>
      <ul className="space-y-1.5">
        {parts.map((type) => (
          <li key={type} className="text-[13px]">
            <span className="flex justify-between">
              <span>{ASSESSMENT_LABELS[type]}</span>
              <span className="font-semibold tabular-nums">{weights[type]}%</span>
            </span>
            <span className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${weights[type]}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
      {differs && reference && (
        <p className="mt-2 text-[12px] text-muted-foreground">
          Weights shown for {reference.sectionName}; some sections use their own.
        </p>
      )}
      <details className="mt-3 text-[12.5px]">
        <summary className="cursor-pointer font-semibold text-link">Grade scale</summary>
        <table className="mt-2 w-full tabular-nums">
          <tbody>
            {GRADE_SCALE.map((band, i) => (
              <tr key={band.grade} className="border-t first:border-t-0">
                <td className="py-1 font-semibold">{band.grade}</td>
                <td className="py-1 text-muted-foreground">
                  {band.min > 0
                    ? `${band.min}%${i > 0 ? ` – ${(GRADE_SCALE[i - 1]?.min ?? 100) - 1}%` : ' and above'}`
                    : `below ${GRADE_SCALE[i - 1]?.min ?? 50}%`}
                </td>
                <td className="py-1 text-right">{band.points.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}

/** One course: what it teaches, how it is graded, and who offers it this term. */
export default function CoursePage() {
  const { code = '' } = useParams();
  const detail = useQuery({
    queryKey: keys.courseDetail(code.toUpperCase()),
    queryFn: () => api.academics.courseDetail(code),
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
  });

  const back = (
    <Link
      to="/academics/courses"
      className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden /> Courses
    </Link>
  );

  if (detail.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (!detail.data) {
    return (
      <>
        {back}
        <EmptyState icon={BookOpen} title="Course not found">
          {detail.error instanceof ApiError ? detail.error.message : 'Try again in a moment.'}
        </EmptyState>
      </>
    );
  }

  const { course, term, sections, prerequisites, leadsTo, programs } = detail.data;
  return (
    <>
      {back}
      <header className="mb-6">
        <p className="font-mono text-[13px] font-semibold text-muted-foreground">
          {course.code}
          {course.departmentCode ? ` · ${course.departmentCode}` : ''}
        </p>
        <h1 className="mt-0.5 text-[24px] leading-tight font-bold tracking-tight">
          {course.title}
        </h1>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone="outline">
            {formatCredits(course.credits, course.labCredits)} credit hours
          </Badge>
          {course.labCredits > 0 && <Badge tone="outline">Includes a lab</Badge>}
          {sections.length ? (
            <Badge tone="primary">
              {sections.length} section{sections.length === 1 ? '' : 's'} in {term.name}
            </Badge>
          ) : (
            <Badge>Not offered in {term.name}</Badge>
          )}
        </div>
        {course.description && (
          <p className="mt-3 max-w-3xl text-[14.5px] leading-relaxed">{course.description}</p>
        )}
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          <Card title={`Sections in ${term.name}`}>
            {sections.length ? (
              <ul className="divide-y" aria-label="Sections">
                {sections.map((s) => (
                  <SectionRow key={s.offeringId} section={s} />
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-[13.5px] text-muted-foreground">
                No section takes this course this term.
              </p>
            )}
          </Card>

          {course.clos.length > 0 && (
            <Card title="Learning outcomes" description="By the end of the course, students can:">
              <ol className="divide-y">
                {course.clos.map((clo) => (
                  <li key={clo.code} className="flex gap-3 px-4 py-2.5 text-[14px]">
                    <span className="w-11 shrink-0 font-mono text-[12.5px] font-semibold text-muted-foreground">
                      {clo.code}
                    </span>
                    {clo.text}
                  </li>
                ))}
              </ol>
            </Card>
          )}

          {course.outline.length > 0 && (
            <Card title="Weekly outline">
              <ol className="grid sm:grid-cols-2">
                {course.outline.map((week) => (
                  <li
                    key={week.week}
                    className="flex gap-3 border-t px-4 py-2 text-[13.5px] first:border-t-0 sm:[&:nth-child(2)]:border-t-0 sm:odd:border-r"
                  >
                    <span className="w-14 shrink-0 text-[12.5px] font-semibold text-muted-foreground tabular-nums">
                      Week {week.week}
                    </span>
                    {week.topic}
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>

        <aside className="h-fit overflow-hidden rounded-lg border bg-surface">
          <SideBlock title="Prerequisites">
            {prerequisites.length ? (
              prerequisites.map((p) => <CourseLink key={p.code} code={p.code} title={p.title} />)
            ) : (
              <p className="text-[13.5px] text-muted-foreground">None</p>
            )}
          </SideBlock>
          {leadsTo.length > 0 && (
            <SideBlock title="Required for">
              {leadsTo.map((c) => (
                <CourseLink key={c.code} code={c.code} title={c.title} />
              ))}
            </SideBlock>
          )}
          {programs.length > 0 && (
            <SideBlock title="Degree plans">
              <ul className="space-y-0.5 text-[13.5px]">
                {programs.map((p) => (
                  <li key={`${p.code}-${p.semester}`}>
                    {p.name} <span className="text-muted-foreground">· semester {p.semester}</span>
                  </li>
                ))}
              </ul>
            </SideBlock>
          )}
          <SideBlock title="Grading">
            <Grading sections={sections} />
          </SideBlock>
        </aside>
      </div>
    </>
  );
}
