import {
  type CourseStanding,
  GRADE_SCALE,
  gradeFor,
  gradeTargets,
  round,
  type StudentRecordRefDTO,
  type UserDTO,
} from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { NavLink, useSearchParams } from 'react-router';
import { Spinner } from '@/components/feedback';
import { Input } from '@/components/ui/form';
import { useDebounced } from '@/hooks/useDebounced';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export const fixed = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined ? '–' : n.toFixed(digits);

export function gradeTone(points: number): string {
  if (points >= 3.66) return 'text-primary dark:text-link';
  if (points >= 2) return 'text-foreground';
  if (points > 0) return 'text-warning';
  return 'text-danger';
}

/** Staff and teachers open records of students; students only their own. */
export const looksUpStudents = (me: Pick<UserDTO, 'role'>) => me.role !== 'student';

/** Results · Transcript · Degree progress (keeps the chosen student for staff). */
export function RecordTabs({ me }: { me: Pick<UserDTO, 'role'> }) {
  const [params] = useSearchParams();
  const student = params.get('student');
  const suffix = student ? `?student=${student}` : '';
  const tabs = [
    ...(me.role === 'student' ? [{ to: '/academics/results', label: 'This term' }] : []),
    { to: `/academics/transcript${suffix}`, label: 'Transcript' },
    { to: `/academics/progress${suffix}`, label: 'Degree progress' },
  ];
  return (
    <nav aria-label="Records" className="mb-5 flex gap-1 border-b" data-print-hide>
      {tabs.map((t) => (
        <NavLink
          key={t.label}
          to={t.to}
          end
          className={({ isActive }) =>
            cn(
              '-mb-px border-b-2 px-3 py-2 text-[14px] whitespace-nowrap',
              isActive
                ? 'border-primary font-semibold text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

/** Find a student whose record you may open (the server decides who that is). */
export function StudentPicker({ current }: { current: StudentRecordRefDTO | null }) {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const term = useDebounced(q.trim(), 250);
  const found = useQuery({
    queryKey: ['academics', 'records', 'students', term],
    queryFn: () => api.academics.recordStudents(term),
  });
  return (
    <section className="mb-5 rounded-lg border bg-surface p-3" data-print-hide>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          aria-label="Find a student"
          placeholder="Find a student by name or registration number"
          className="pl-9"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <ul aria-label="Students" className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
        {found.isPending && <Spinner />}
        {found.data?.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('student', s.id);
                setParams(next, { replace: true });
              }}
              className={cn(
                'rounded-md border px-2.5 py-1 text-[13px]',
                current?.id === s.id
                  ? 'border-primary bg-primary-soft font-semibold'
                  : 'border-border-strong hover:bg-surface-2',
              )}
            >
              {s.name} <span className="text-muted-foreground">· {s.regNo}</span>
            </button>
          </li>
        ))}
        {found.data && !found.data.length && (
          <li className="text-[13px] text-muted-foreground">
            No students you can open match that.
          </li>
        )}
      </ul>
    </section>
  );
}

/**
 * "What do I need?": the score needed on everything not yet marked for each grade, and a
 * what-if slider. Pure arithmetic on the published marks (the same as the official calculation).
 */
export function WhatIfPanel({ standing }: { standing: CourseStanding }) {
  const [rest, setRest] = useState(70);
  if (!standing.remainingWeight) return null;
  const targets = gradeTargets(standing);
  const final = round(standing.earned + (standing.remainingWeight * rest) / 100, 1);
  const band = gradeFor(final);
  return (
    <section aria-label="What do I need" className="border-t px-4 py-3">
      <h3 className="text-[13px] font-bold">What do I need?</h3>
      <p className="text-[12.5px] text-muted-foreground">
        {standing.remainingWeight}% of the course is still to be marked. On average across it you
        would need:
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {targets.map((t) => (
          <li
            key={t.grade}
            className={cn(
              'rounded-md border px-2 py-1 text-[12.5px] tabular-nums',
              t.status === 'secured' && 'border-primary/30 bg-primary-soft',
              t.status === 'out-of-reach' && 'opacity-50',
            )}
          >
            <span className="font-bold">{t.grade}</span>{' '}
            {t.status === 'secured'
              ? 'secured'
              : t.status === 'out-of-reach'
                ? 'out of reach'
                : `${t.needed}%`}
          </li>
        ))}
      </ul>
      <label className="mt-3 flex flex-wrap items-center gap-3 text-[13px]">
        <span>If I score</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={rest}
          onChange={(e) => setRest(Number(e.target.value))}
          className="w-48 accent-primary"
          aria-valuetext={`${rest}% on the rest`}
        />
        <span className="w-24 font-semibold tabular-nums">{rest}% on the rest</span>
        <span>
          → final <span className="font-bold tabular-nums">{final}%</span>,{' '}
          <span className={cn('font-bold', gradeTone(band.points))}>{band.grade}</span>
          <span className="text-muted-foreground">
            {' '}
            ({GRADE_SCALE.find((g) => g.grade === band.grade)?.points.toFixed(2)} points)
          </span>
        </span>
      </label>
    </section>
  );
}
