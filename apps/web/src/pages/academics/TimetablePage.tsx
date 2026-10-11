import {
  addDays,
  type ClassOccurrenceDTO,
  campusClock,
  formatClock,
  formatShortDate,
  formatTimeRange,
  mondayOf,
  type TimetableView,
  type TimetableWeekDTO,
  WEEKDAY_LABELS,
  WEEKDAY_SHORT,
  type Weekday,
} from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import { type CSSProperties, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { EmptyState, Spinner } from '@/components/feedback';
import { PageHeader, Tabs } from '@/components/page';
import { ClassDialog } from '@/components/timetable/ClassDialog';
import { type GridItem, WeekGrid } from '@/components/timetable/WeekGrid';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
import { useRooms } from '@/hooks/academics';
import { useCurrentUser } from '@/hooks/queries';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { cn, courseHues } from '@/lib/utils';

/** Re-renders every minute so "now" lines and countdowns stay current. */
export function useCampusClock() {
  const [clock, setClock] = useState(() => campusClock());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(campusClock()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return clock;
}

export function canEditTimetable(me: { role: string; office: string | null }) {
  return me.role === 'admin' || (me.role === 'staff' && me.office === 'DEPARTMENT');
}

const STATUS_BADGE = {
  cancelled: { tone: 'danger', label: 'Cancelled' },
  'moved-out': { tone: 'warning', label: 'Moved' },
  'moved-in': { tone: 'warning', label: 'Moved here' },
} as const;

function describe(o: ClassOccurrenceDTO): string {
  const status = o.status === 'scheduled' ? '' : `, ${STATUS_BADGE[o.status].label.toLowerCase()}`;
  return `${o.slot.code} ${o.slot.title} · ${o.slot.sectionName ?? ''}, ${WEEKDAY_LABELS[o.slot.day as Weekday] ?? ''} ${formatTimeRange(o.start, o.end)}, ${o.room?.name ?? 'no room'}${status}`;
}

function linesFor(o: ClassOccurrenceDTO, view: TimetableView, role: string): string[] {
  const room = o.room?.name ?? 'Room TBA';
  const teacher = o.slot.instructor?.name ?? '';
  const section = o.slot.sectionName ?? '';
  if (view === 'teacher' || (view === 'me' && role === 'faculty')) return [room, section];
  if (view === 'room') return [section, teacher];
  return [room, teacher].filter(Boolean);
}

function DayList({
  week,
  today,
  hueFor,
  onSelect,
}: {
  week: TimetableWeekDTO;
  today: string;
  hueFor: (code: string) => number;
  onSelect: (o: ClassOccurrenceDTO) => void;
}) {
  const initial = week.days.find((d) => d.date === today)?.date ?? week.days[0]?.date ?? today;
  const [day, setDay] = useState(initial);
  useEffect(() => setDay(initial), [initial]);
  const selected = week.days.find((d) => d.date === day);

  return (
    <div>
      <div className="mb-3 grid grid-cols-6 gap-1" role="tablist" aria-label="Day">
        {week.days.map((d) => (
          <button
            key={d.date}
            type="button"
            role="tab"
            aria-selected={d.date === day}
            onClick={() => setDay(d.date)}
            className={cn(
              'flex flex-col items-center rounded-lg border py-1.5 text-[12px]',
              d.date === day
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-surface text-muted-foreground',
            )}
          >
            <span className="font-semibold">{WEEKDAY_SHORT[d.weekday as Weekday]}</span>
            <span
              className={cn(
                'tabular-nums',
                d.date === today && d.date !== day && 'font-bold text-primary',
              )}
            >
              {Number(d.date.slice(8))}
            </span>
            <span
              aria-hidden
              className={cn(
                'mt-0.5 size-1 rounded-full',
                d.occurrences.length
                  ? d.date === day
                    ? 'bg-primary-foreground'
                    : 'bg-primary'
                  : 'bg-transparent',
              )}
            />
          </button>
        ))}
      </div>
      {!selected?.occurrences.length ? (
        <EmptyState
          icon={CalendarDays}
          title="No classes"
          className="rounded-lg border bg-surface"
        />
      ) : (
        <ul className="space-y-2">
          {selected.occurrences.map((o) => (
            <li key={`${o.slot.id}:${o.status}`}>
              <button
                type="button"
                onClick={() => onSelect(o)}
                aria-label={describe(o)}
                style={{ '--h': hueFor(o.slot.code) } as CSSProperties}
                className={cn(
                  'flex w-full gap-3 rounded-lg border border-l-4 bg-surface p-3 text-left',
                  o.status === 'cancelled' ? 'border-l-danger' : 'border-l-[hsl(var(--h)_55%_42%)]',
                  o.status === 'moved-out' && 'opacity-60',
                )}
              >
                <span className="flex w-16 shrink-0 flex-col text-[12.5px] font-semibold tabular-nums">
                  <span>{formatClock(o.start)}</span>
                  <span className="font-normal text-muted-foreground">{formatClock(o.end)}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block truncate text-[14px] font-bold',
                      (o.status === 'cancelled' || o.status === 'moved-out') && 'line-through',
                    )}
                  >
                    {o.slot.code} {o.slot.title}
                  </span>
                  <span className="block truncate text-[12.5px] text-muted-foreground">
                    {[o.room?.name ?? 'Room TBA', o.slot.sectionName, o.slot.instructor?.name]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                {o.status !== 'scheduled' && (
                  <Badge tone={STATUS_BADGE[o.status].tone}>{STATUS_BADGE[o.status].label}</Badge>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function TimetablePage() {
  const me = useCurrentUser();
  const clock = useCampusClock();
  const [params, setParams] = useSearchParams();
  const personal = me.role === 'student' || me.role === 'faculty';
  const view = (params.get('view') as TimetableView | null) ?? (personal ? 'me' : 'section');
  const week = mondayOf(params.get('week') ?? clock.date);

  const sections = useQuery({ queryKey: keys.sections, queryFn: api.academics.sections });
  const teachers = useQuery({ queryKey: keys.teachers, queryFn: api.academics.teachers });
  const rooms = useRooms();
  const options =
    view === 'section'
      ? (sections.data ?? []).map((s) => ({
          id: s.id,
          label: `${s.name} (${s.departmentCode ?? ''})`,
        }))
      : view === 'teacher'
        ? (teachers.data ?? []).map((t) => ({ id: t.id, label: t.name }))
        : view === 'room'
          ? (rooms.data ?? []).map((r) => ({ id: r.id, label: `${r.name} · ${r.block}` }))
          : [];
  const fallbackId =
    view === 'section' && me.sectionId
      ? me.sectionId
      : view === 'teacher' && me.role === 'faculty'
        ? me.id
        : options[0]?.id;
  const id = view === 'me' ? undefined : (params.get('id') ?? fallbackId);

  const timetable = useQuery({
    queryKey: [...keys.timetable, view, id ?? '', week],
    queryFn: () => api.academics.timetable({ view, id, week }),
    enabled: view === 'me' || !!id,
  });
  const [selected, setSelected] = useState<ClassOccurrenceDTO | null>(null);

  const update = (next: Record<string, string | undefined>) => {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) merged.set(key, value);
      else merged.delete(key);
    }
    setParams(merged, { replace: true });
  };

  const data = timetable.data;
  const hueFor = courseHues(data?.days.flatMap((d) => d.occurrences.map((o) => o.slot.code)) ?? []);
  const items: GridItem[] =
    data?.days.flatMap((day, column) =>
      day.occurrences.map((o) => ({
        id: `${o.slot.id}:${o.date}:${o.status}`,
        column,
        start: o.start,
        end: o.end,
        title: `${o.slot.code} ${o.slot.title}`,
        lines: linesFor(o, view, me.role),
        hue: hueFor(o.slot.code),
        status: o.status === 'scheduled' ? null : o.status,
        label: describe(o),
        onClick: () => setSelected(o),
      })),
    ) ?? [];
  const thisWeek = mondayOf(clock.date);
  const count =
    data?.days.reduce(
      (n, d) => n + d.occurrences.filter((o) => o.status !== 'moved-out').length,
      0,
    ) ?? 0;

  return (
    <>
      <PageHeader
        title={data?.title ?? 'Timetable'}
        description={
          data
            ? `${data.term.name} · week of ${formatShortDate(data.weekStart)} · ${count} class${count === 1 ? '' : 'es'}`
            : 'Weekly classes of the current term'
        }
        actions={
          canEditTimetable(me) ? (
            <Link to="/academics/timetable/edit" className={buttonVariants({ variant: 'outline' })}>
              <Pencil /> Edit timetable
            </Link>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs
          className="mb-0 border-b-0"
          label="Whose timetable"
          value={view}
          onChange={(value) => update({ view: value, id: undefined })}
          options={[
            ...(personal ? [{ value: 'me' as const, label: 'Mine' }] : []),
            { value: 'section' as const, label: 'Section' },
            { value: 'teacher' as const, label: 'Teacher' },
            { value: 'room' as const, label: 'Room' },
          ]}
        />
        {view !== 'me' && (
          <Select
            aria-label={`Choose a ${view}`}
            className="w-auto min-w-48"
            value={id ?? ''}
            onChange={(e) => update({ id: e.target.value })}
          >
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous week"
            onClick={() => update({ week: addDays(week, -7) })}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            disabled={week === thisWeek}
            onClick={() => update({ week: undefined })}
          >
            This week
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next week"
            onClick={() => update({ week: addDays(week, 7) })}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      {timetable.isPending && (view === 'me' || id) ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !data ? (
        <EmptyState icon={CalendarDays} title="Nothing to show" />
      ) : (
        <>
          <div className="hidden md:block">
            <WeekGrid
              columns={data.days.map((d) => ({
                key: d.date,
                label: WEEKDAY_LABELS[d.weekday as Weekday] ?? '',
                sublabel: formatShortDate(d.date).split(' ').slice(1).join(' '),
                today: d.date === clock.date,
              }))}
              items={items}
              nowMinutes={clock.minutes}
              emptyHint={
                view === 'me' && !personal
                  ? 'You have no classes. Pick a section, teacher or room.'
                  : 'No classes this week.'
              }
            />
          </div>
          <div className="md:hidden">
            <DayList week={data} today={clock.date} hueFor={hueFor} onSelect={setSelected} />
          </div>
        </>
      )}
      <ClassDialog
        key={selected ? `${selected.slot.id}:${selected.date}` : 'none'}
        occurrence={selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
