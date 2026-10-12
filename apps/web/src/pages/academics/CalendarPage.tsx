import {
  addDays,
  CALENDAR_KIND_LABELS,
  CALENDAR_KINDS,
  type CalendarEventDTO,
  type CalendarItemDTO,
  type CalendarKind,
  calendarEventSchema,
  campusClock,
  formatShortDate,
  formatTimeRange,
  mondayOf,
  type UserDTO,
} from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { EmptyState, Spinner } from '@/components/feedback';
import { PageHeader, Tabs } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/menu';
import { useCurrentTerm } from '@/hooks/academics';
import { useCurrentUser } from '@/hooks/queries';
import { useAction, useSubmit } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const canEditCalendar = (me: Pick<UserDTO, 'role' | 'office'>) =>
  me.role === 'admin' || (me.role === 'staff' && me.office === 'DIRECTOR');

export const CATEGORY_TONE: Record<CalendarKind, string> = {
  holiday: 'bg-danger-soft text-danger border-danger/25',
  exams: 'bg-warning-soft text-warning border-warning/25',
  registration: 'bg-primary-soft text-primary border-primary/25 dark:text-link',
  deadline: 'bg-primary-soft text-primary border-primary/25 dark:text-link',
  event: 'bg-surface-2 text-foreground border-border-strong',
};

const monthFormat = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const monthName = (month: string) => monthFormat.format(new Date(`${month}-01T00:00:00Z`));

function shiftMonth(month: string, by: number): string {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
}

function lastDayOf(month: string): string {
  return addDays(`${shiftMonth(month, 1)}-01`, -1);
}

function DayItems({ items, date }: { items: CalendarItemDTO[]; date: string }) {
  if (!items.length) {
    return (
      <p className="text-[13.5px] text-muted-foreground">Nothing on {formatShortDate(date)}.</p>
    );
  }
  return (
    <ul className="space-y-1.5" aria-label={`On ${formatShortDate(date)}`}>
      {items.map((item) => (
        <li
          key={item.id}
          className={cn(
            'rounded-md border px-3 py-2 text-[13.5px]',
            item.category ? CATEGORY_TONE[item.category] : 'bg-surface',
            item.status === 'cancelled' && 'opacity-60',
          )}
        >
          <p className="flex flex-wrap items-baseline gap-x-2">
            {item.start && item.end && (
              <span className="w-32 shrink-0 font-semibold tabular-nums">
                {formatTimeRange(item.start, item.end)}
              </span>
            )}
            <span className={cn('font-semibold', item.status === 'cancelled' && 'line-through')}>
              {item.link ? (
                <Link to={item.link} className="hover:underline">
                  {item.title}
                </Link>
              ) : (
                item.title
              )}
            </span>
            {item.kind === 'exam' && <Badge tone="warning">Exam</Badge>}
            {item.status === 'cancelled' && <Badge tone="danger">Cancelled</Badge>}
            {item.status === 'moved' && <Badge tone="warning">Moved here</Badge>}
          </p>
          {item.detail && <p className="text-[12.5px] opacity-80">{item.detail}</p>}
        </li>
      ))}
    </ul>
  );
}

function MyCalendar() {
  const clock = campusClock();
  const [params, setParams] = useSearchParams();
  const month = params.get('month') ?? clock.date.slice(0, 7);
  const [selected, setSelected] = useState(clock.date);
  const first = mondayOf(`${month}-01`);
  const last = addDays(mondayOf(lastDayOf(month)), 6);
  const query = useQuery({
    queryKey: ['academics', 'calendar', 'mine', first, last],
    queryFn: () => api.academics.myCalendar(first, last),
    placeholderData: (previous) => previous,
  });
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarItemDTO[]>();
    for (const item of query.data ?? []) map.set(item.date, [...(map.get(item.date) ?? []), item]);
    return map;
  }, [query.data]);
  const days: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(d);
  const go = (next: string) => {
    setParams({ month: next }, { replace: true });
    setSelected(next === clock.date.slice(0, 7) ? clock.date : `${next}-01`);
  };
  // Regular classes are on the grid; list the rest. A multi-day entry is listed once.
  const seen = new Set<string>();
  const upcoming = (query.data ?? []).filter((i) => {
    if (i.date < clock.date || (i.kind === 'class' && i.status !== 'cancelled')) return false;
    if (!i.endsOn) return true;
    const key = `${i.title}:${i.endsOn}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section aria-label={monthName(month)} className="min-w-0">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="mr-auto text-[17px] font-bold">{monthName(month)}</h2>
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous month"
            onClick={() => go(shiftMonth(month, -1))}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            disabled={month === clock.date.slice(0, 7)}
            onClick={() => go(clock.date.slice(0, 7))}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next month"
            onClick={() => go(shiftMonth(month, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="overflow-hidden rounded-lg border bg-surface">
          <div className="grid grid-cols-7 border-b bg-surface-2 text-center text-[11.5px] font-semibold text-muted-foreground">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <span key={d} className="py-1.5">
                {d}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((date) => {
              const items = byDate.get(date) ?? [];
              const classes = items.filter((i) => i.kind === 'class' && i.status !== 'cancelled');
              const others = items.filter((i) => i.kind !== 'class');
              const inMonth = date.startsWith(month);
              return (
                <button
                  key={date}
                  type="button"
                  aria-pressed={date === selected}
                  aria-label={`${formatShortDate(date)}: ${items.length ? `${classes.length} classes${others.length ? `, ${others.map((o) => o.title).join(', ')}` : ''}` : 'nothing'}`}
                  onClick={() => setSelected(date)}
                  className={cn(
                    'flex min-h-20 flex-col gap-0.5 border-t border-l p-1 text-left text-[11.5px] transition-colors [&:nth-child(7n+1)]:border-l-0 hover:bg-surface-2 sm:min-h-24',
                    !inMonth && 'bg-surface-2/60 text-muted-foreground',
                    date === selected && 'bg-primary-soft/60 ring-2 ring-primary ring-inset',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-6 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums',
                      date === clock.date && 'bg-primary text-primary-foreground',
                    )}
                  >
                    {Number(date.slice(8))}
                  </span>
                  {others.slice(0, 2).map((o) => (
                    <span
                      key={o.id}
                      className={cn(
                        'truncate rounded border px-1 leading-4',
                        o.category
                          ? CATEGORY_TONE[o.category]
                          : 'border-warning/25 bg-warning-soft text-warning',
                      )}
                    >
                      {o.kind === 'exam' ? o.title.split(' ')[0] : o.title}
                    </span>
                  ))}
                  {others.length > 2 && (
                    <span className="text-muted-foreground">+{others.length - 2} more</span>
                  )}
                  {classes.length > 0 && (
                    <span className="mt-auto text-muted-foreground">
                      {classes.length} class{classes.length === 1 ? '' : 'es'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <p className="mt-2 flex flex-wrap gap-3 text-[12px] text-muted-foreground">
          {(['holiday', 'exams', 'deadline', 'event'] as const).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className={cn('size-2.5 rounded-sm border', CATEGORY_TONE[k])} aria-hidden />
              {CALENDAR_KIND_LABELS[k]}
            </span>
          ))}
        </p>
      </section>

      <aside className="space-y-5">
        <section>
          <h2 className="mb-2 text-[14px] font-bold">{formatShortDate(selected)}</h2>
          {query.isPending ? (
            <Spinner />
          ) : (
            <DayItems items={byDate.get(selected) ?? []} date={selected} />
          )}
        </section>
        <section>
          <h2 className="mb-2 text-[14px] font-bold">Coming up</h2>
          {upcoming.length ? (
            <ul className="space-y-1 text-[13px]">
              {upcoming.slice(0, 8).map((i) => (
                <li key={i.id} className="flex gap-2">
                  <span className="w-20 shrink-0 text-muted-foreground">
                    {formatShortDate(i.date)}
                  </span>
                  <span className={cn(i.status === 'cancelled' && 'line-through opacity-70')}>
                    {i.title}
                    {i.endsOn && (
                      <span className="block text-[12px] text-muted-foreground">
                        until {formatShortDate(i.endsOn)}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted-foreground">Nothing else this month.</p>
          )}
        </section>
      </aside>
    </div>
  );
}

function EntryDialog({ entry, onClose }: { entry: CalendarEventDTO | 'new'; onClose: () => void }) {
  const existing = entry === 'new' ? null : entry;
  const today = campusClock().date;
  const [form, setForm] = useState({
    title: existing?.title ?? '',
    kind: existing?.kind ?? ('event' as CalendarKind),
    startsOn: existing?.startsOn ?? today,
    endsOn: existing?.endsOn ?? today,
    description: existing?.description ?? '',
  });
  const save = useSubmit(
    calendarEventSchema,
    (input) => api.academics.saveCalendarEvent(input, existing?.id),
    {
      done: (e) =>
        e.kind === 'holiday'
          ? `${e.title} added. Classes that day are cancelled and everyone was told.`
          : `${e.title} saved`,
      invalidate: [['academics']],
    },
  );
  const set = (field: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.run({ ...form, description: form.description.trim() || null }, onClose);
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={existing ? 'Edit date' : 'Add a date'}
        description="Holidays cancel that day's classes for everyone, and people are told."
      >
        <form onSubmit={submit} className="space-y-3">
          <Field label="Title" htmlFor="cal-title">
            <Input
              id="cal-title"
              value={form.title}
              onChange={set('title')}
              placeholder="e.g. Iqbal Day"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Kind" htmlFor="cal-kind">
              <Select id="cal-kind" value={form.kind} onChange={set('kind')}>
                {CALENDAR_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {CALENDAR_KIND_LABELS[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="From" htmlFor="cal-from">
              <Input id="cal-from" type="date" value={form.startsOn} onChange={set('startsOn')} />
            </Field>
            <Field label="To" htmlFor="cal-to">
              <Input id="cal-to" type="date" value={form.endsOn} onChange={set('endsOn')} />
            </Field>
          </div>
          <Field label="Details (optional)" htmlFor="cal-desc">
            <Textarea
              id="cal-desc"
              rows={2}
              value={form.description}
              onChange={set('description')}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.pending}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AcademicCalendar() {
  const me = useCurrentUser();
  const term = useCurrentTerm();
  const from = term?.startsOn ?? `${campusClock().date.slice(0, 7)}-01`;
  const to = term?.endsOn ?? addDays(from, 180);
  const query = useQuery({
    queryKey: ['academics', 'calendar', from, to],
    queryFn: () => api.academics.calendar(from, to),
  });
  const [editing, setEditing] = useState<CalendarEventDTO | 'new' | null>(null);
  const remove = useAction((id: string) => api.academics.deleteCalendarEvent(id), {
    done: 'Removed from the calendar',
    invalidate: [['academics']],
  });
  const editable = canEditCalendar(me);
  const months = new Map<string, CalendarEventDTO[]>();
  for (const e of query.data ?? []) {
    const m = e.startsOn.slice(0, 7);
    months.set(m, [...(months.get(m) ?? []), e]);
  }
  const today = campusClock().date;
  return (
    <>
      {editable && (
        <div className="mb-3 flex justify-end">
          <Button onClick={() => setEditing('new')}>
            <Plus /> Add a date
          </Button>
        </div>
      )}
      {query.isPending ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !months.size ? (
        <EmptyState
          icon={CalendarDays}
          title="The academic calendar is empty"
          className="rounded-lg border bg-surface"
        />
      ) : (
        <div className="space-y-4">
          {[...months.entries()].map(([month, entries]) => (
            <section key={month} aria-label={monthName(month)}>
              <h2 className="mb-1.5 text-[14px] font-bold">{monthName(month)}</h2>
              <ul className="divide-y overflow-hidden rounded-lg border bg-surface">
                {entries.map((e) => (
                  <li
                    key={e.id}
                    className={cn(
                      'flex items-center gap-3 px-4 py-2.5',
                      e.endsOn < today && 'opacity-60',
                    )}
                  >
                    <span className="w-40 shrink-0 text-[13px] font-semibold tabular-nums">
                      {e.startsOn === e.endsOn
                        ? formatShortDate(e.startsOn)
                        : `${formatShortDate(e.startsOn)} – ${formatShortDate(e.endsOn)}`}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold">{e.title}</span>
                      {e.description && (
                        <span className="block text-[12.5px] text-muted-foreground">
                          {e.description}
                        </span>
                      )}
                    </span>
                    <span
                      className={cn(
                        'rounded border px-1.5 text-[11.5px] font-semibold',
                        CATEGORY_TONE[e.kind],
                      )}
                    >
                      {CALENDAR_KIND_LABELS[e.kind]}
                    </span>
                    {editable && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Options for ${e.title}`}
                          >
                            <Ellipsis />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing(e)}>
                            <Pencil /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem danger onSelect={() => remove.mutate(e.id)}>
                            <Trash2 /> Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {editing && <EntryDialog entry={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

/** My calendar (classes, papers, academic dates) and the academic calendar itself. */
export default function CalendarPage() {
  const me = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const personal = me.role === 'student' || me.role === 'faculty';
  const tab = params.get('tab') ?? (personal ? 'mine' : 'academic');
  return (
    <>
      <PageHeader
        title="Calendar"
        description={
          personal
            ? 'Your classes, your papers and the academic dates in one place. You get reminders the evening before a paper and on deadline days.'
            : "The term's holidays, exam periods, registration and deadlines."
        }
      />
      <Tabs
        label="Calendar"
        value={tab}
        onChange={(value) => setParams({ tab: value }, { replace: true })}
        options={[
          ...(personal ? [{ value: 'mine', label: 'My calendar' }] : []),
          { value: 'academic', label: 'Academic calendar' },
        ]}
      />
      {tab === 'mine' && personal ? <MyCalendar /> : <AcademicCalendar />}
    </>
  );
}
