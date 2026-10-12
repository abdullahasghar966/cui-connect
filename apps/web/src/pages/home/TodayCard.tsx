import {
  type ClassOccurrenceDTO,
  campusInstant,
  formatClock,
  formatShortDate,
  formatTimeRange,
  toMinutes,
} from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Coffee } from 'lucide-react';
import { type CSSProperties, useState } from 'react';
import { ClassDialog } from '@/components/timetable/ClassDialog';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { cn, hueFor } from '@/lib/utils';
import { BreakNotice, useCampusClock } from '@/pages/academics/TimetablePage';
import { HomeCard } from './HomeCard';

function until(o: ClassOccurrenceDTO, now: Date): string {
  const minutes = Math.round((campusInstant(o.date, o.start).getTime() - now.getTime()) / 60_000);
  if (minutes < 60) return `in ${Math.max(1, minutes)} min`;
  if (minutes < 24 * 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `in ${hours} h${rest ? ` ${rest} min` : ''}`;
  }
  return `on ${formatShortDate(o.date)}`;
}

function Highlight({
  label,
  occurrence,
  detail,
  onOpen,
}: {
  label: string;
  occurrence: ClassOccurrenceDTO;
  detail: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ '--h': hueFor(occurrence.slot.code) } as CSSProperties}
      className="flex w-full items-center gap-3 rounded-lg border border-l-4 border-l-[hsl(var(--h)_55%_42%)] bg-surface-2 px-3 py-2.5 text-left hover:bg-muted"
    >
      <span className="min-w-0 flex-1">
        <span className="text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
        <span className="block truncate text-[15px] font-bold">
          {occurrence.slot.code} {occurrence.slot.title}
        </span>
        <span className="block truncate text-[13px] text-muted-foreground">
          {formatTimeRange(occurrence.start, occurrence.end)} ·{' '}
          {occurrence.room?.name ?? 'Room TBA'}
          {occurrence.slot.instructor ? ` · ${occurrence.slot.instructor.name}` : ''}
        </span>
      </span>
      <span className="shrink-0 text-right text-[13px] font-semibold text-primary dark:text-link">
        {detail}
      </span>
    </button>
  );
}

/** Now, next and the rest of today, for students and teachers. */
export function TodayCard() {
  const clock = useCampusClock();
  const today = useQuery({
    queryKey: keys.today,
    queryFn: api.academics.today,
    refetchInterval: 60_000,
  });
  const [open, setOpen] = useState<ClassOccurrenceDTO | null>(null);
  const data = today.data;
  const now = new Date();

  return (
    <HomeCard
      title="Today"
      icon={CalendarDays}
      action={{ to: '/academics/timetable', label: 'Timetable' }}
    >
      {!data ? (
        <div className="h-24" />
      ) : (
        <div className="space-y-3 p-4">
          <BreakNotice occurrences={data.today} className="" />
          {data.current && (
            <Highlight
              label="Now"
              occurrence={data.current}
              detail={`until ${formatClock(data.current.end)}`}
              onOpen={() => setOpen(data.current)}
            />
          )}
          {data.next ? (
            <Highlight
              label="Next class"
              occurrence={data.next}
              detail={until(data.next, now)}
              onOpen={() => setOpen(data.next)}
            />
          ) : (
            !data.current && (
              <p className="flex items-center gap-2 text-[13.5px] text-muted-foreground">
                <Coffee className="size-4" aria-hidden /> No classes in the next two weeks.
              </p>
            )
          )}
          {data.today.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {data.today.map((o) => {
                const past = o.date === clock.date && toMinutes(o.end) <= clock.minutes;
                return (
                  <li key={`${o.slot.id}:${o.status}`}>
                    <button
                      type="button"
                      onClick={() => setOpen(o)}
                      className={cn(
                        'flex w-full items-center gap-3 px-3 py-2 text-left text-[13.5px] hover:bg-surface-2',
                        past && 'text-muted-foreground',
                      )}
                    >
                      <span className="w-16 shrink-0 tabular-nums">{formatClock(o.start)}</span>
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate font-semibold',
                          o.status === 'cancelled' && 'line-through',
                        )}
                      >
                        {o.slot.code} {o.slot.title}
                      </span>
                      <span className="hidden text-muted-foreground sm:inline">
                        {o.room?.name ?? ''}
                      </span>
                      {o.status === 'cancelled' && <Badge tone="danger">Cancelled</Badge>}
                      {o.status === 'moved-in' && <Badge tone="warning">Moved here</Badge>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      <ClassDialog
        key={open ? `${open.slot.id}:${open.date}` : 'none'}
        occurrence={open}
        onClose={() => setOpen(null)}
      />
    </HomeCard>
  );
}
