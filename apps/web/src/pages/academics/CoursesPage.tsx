import { formatCredits } from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, ChevronRight, Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { EmptyState, Spinner } from '@/components/feedback';
import { PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Checkbox, Input, Select } from '@/components/ui/form';
import { useCurrentTerm } from '@/hooks/academics';
import { useDebounced } from '@/hooks/useDebounced';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';

/** The course catalog: search by code or title, filter by department and this term. */
export default function CoursesPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const departmentId = params.get('department') ?? '';
  const offered = params.get('offered') === '1';
  const search = useDebounced(q.trim(), 250);
  const term = useCurrentTerm();

  const departments = useQuery({
    queryKey: keys.departments,
    queryFn: api.academics.departments,
    staleTime: 5 * 60_000,
  });
  const catalog = useQuery({
    queryKey: keys.catalog(search, departmentId, offered),
    queryFn: () =>
      api.academics.catalog({
        q: search,
        departmentId: departmentId || undefined,
        offered: offered ? '1' : undefined,
      }),
    placeholderData: (previous) => previous,
  });

  const update = (next: Record<string, string>) => {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) merged.set(key, value);
      else merged.delete(key);
    }
    setParams(merged, { replace: true });
  };

  const courses = catalog.data ?? [];

  return (
    <>
      <PageHeader
        title="Courses"
        description={`The course catalog${term ? ` and who offers each course in ${term.name}` : ''}. Open a course for its outline, learning outcomes, grading and sections.`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1 sm:max-w-sm">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Search courses"
            placeholder="Search by code or title"
            className="pl-9"
            value={q}
            onChange={(e) => update({ q: e.target.value })}
          />
        </div>
        <Select
          aria-label="Department"
          className="sm:w-60"
          value={departmentId}
          onChange={(e) => update({ department: e.target.value })}
        >
          <option value="">All departments</option>
          {(departments.data ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Checkbox
          label="Offered this term"
          checked={offered}
          onChange={(e) => update({ offered: e.target.checked ? '1' : '' })}
          className="ml-1"
        />
        <span className="ml-auto text-[13px] text-muted-foreground tabular-nums" aria-live="polite">
          {catalog.data ? `${courses.length} course${courses.length === 1 ? '' : 's'}` : ''}
        </span>
      </div>

      {catalog.isPending ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !courses.length ? (
        <EmptyState
          icon={BookOpen}
          title="No courses found"
          className="rounded-lg border bg-surface"
        >
          {q ? `Nothing matches "${q}". Try a course code like CSC337.` : 'The catalog is empty.'}
        </EmptyState>
      ) : (
        <ul aria-label="Courses" className="divide-y overflow-hidden rounded-lg border bg-surface">
          {courses.map((c) => (
            <li key={c.code}>
              <Link
                to={`/academics/courses/${c.code}`}
                className="flex items-center gap-4 px-4 py-3 hover:bg-surface-2"
              >
                <span className="w-[68px] shrink-0 font-mono text-[13px] font-semibold text-muted-foreground">
                  {c.code}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-semibold">{c.title}</span>
                  <span className="block truncate text-[12.5px] text-muted-foreground">
                    {[
                      c.departmentCode,
                      `${formatCredits(c.credits, c.labCredits)} credit hours`,
                      c.prerequisites.length ? `Needs ${c.prerequisites.join(', ')}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                {c.offeredSections > 0 ? (
                  <Badge tone="primary" className="hidden sm:inline-flex">
                    {c.offeredSections} section{c.offeredSections === 1 ? '' : 's'} this term
                  </Badge>
                ) : (
                  <span className="hidden text-[12px] text-muted-foreground sm:inline">
                    Not offered this term
                  </span>
                )}
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
