import { formatClock, toMinutes } from '@cui/shared';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

export interface GridColumn {
  key: string;
  label: string;
  sublabel?: string;
  today?: boolean;
}

export type GridStatus = 'cancelled' | 'moved-out' | 'moved-in' | null;

export interface GridItem {
  id: string;
  /** Index into `columns`. */
  column: number;
  start: string;
  end: string;
  title: string;
  lines: string[];
  /** Stable colour per course. */
  hue: number;
  status?: GridStatus;
  /** Full description for screen readers. */
  label: string;
  onClick?: () => void;
}

const HOUR_PX = 60;

const STATUS_LABEL: Record<Exclude<GridStatus, null>, string> = {
  cancelled: 'Cancelled',
  'moved-out': 'Moved',
  'moved-in': 'Moved here',
};

/** Side-by-side lanes for classes that overlap in the same column. */
function lanes(items: GridItem[]): Map<string, { lane: number; count: number }> {
  const result = new Map<string, { lane: number; count: number }>();
  const columns = new Set(items.map((item) => item.column));
  for (const column of columns) {
    for (const [id, place] of columnLanes(items.filter((item) => item.column === column))) {
      result.set(id, place);
    }
  }
  return result;
}

function columnLanes(items: GridItem[]): Map<string, { lane: number; count: number }> {
  const result = new Map<string, { lane: number; count: number }>();
  const sorted = [...items].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  let cluster: GridItem[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const item of cluster) {
      const entry = result.get(item.id);
      if (entry) entry.count = laneEnds.length;
    }
    cluster = [];
    laneEnds = [];
    clusterEnd = -1;
  };
  for (const item of sorted) {
    const start = toMinutes(item.start);
    const end = toMinutes(item.end);
    if (cluster.length && start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else laneEnds[lane] = end;
    result.set(item.id, { lane, count: 1 });
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();
  return result;
}

/** A week (or any set of columns) of timed blocks, like a printed university timetable. */
export function WeekGrid({
  columns,
  items,
  nowMinutes,
  emptyHint,
}: {
  columns: GridColumn[];
  items: GridItem[];
  /** Draws the "now" line in the column marked `today`. */
  nowMinutes?: number;
  emptyHint?: string;
}) {
  const starts = items.map((i) => toMinutes(i.start));
  const ends = items.map((i) => toMinutes(i.end));
  const firstHour = Math.min(8, Math.floor(Math.min(...starts, 8 * 60) / 60));
  const lastHour = Math.max(17, Math.ceil(Math.max(...ends, 17 * 60) / 60));
  const height = (lastHour - firstHour) * HOUR_PX;
  const top = (time: string) => ((toMinutes(time) - firstHour * 60) / 60) * HOUR_PX;
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i);
  const layout = lanes(items);

  return (
    <div className="scrollbar-thin overflow-x-auto rounded-lg border bg-surface">
      <div
        className="grid min-w-[760px]"
        style={{ gridTemplateColumns: `52px repeat(${columns.length}, minmax(0, 1fr))` }}
      >
        <div className="border-b" />
        {columns.map((col) => (
          <div
            key={col.key}
            className={cn(
              'border-b border-l px-2 py-2 text-center',
              col.today && 'bg-primary-soft/60',
            )}
          >
            <p className={cn('text-[13px] font-bold', col.today && 'text-primary dark:text-link')}>
              {col.label}
            </p>
            {col.sublabel && <p className="text-[12px] text-muted-foreground">{col.sublabel}</p>}
          </div>
        ))}

        <div className="relative" style={{ height }}>
          {hours.map((h) => (
            <span
              key={h}
              className="absolute right-2 -translate-y-1/2 text-[11px] text-muted-foreground tabular-nums"
              style={{ top: (h - firstHour) * HOUR_PX }}
            >
              {h === firstHour
                ? ''
                : formatClock(`${String(h).padStart(2, '0')}:00`).replace(':00', '')}
            </span>
          ))}
        </div>
        {columns.map((col, index) => (
          <div
            key={col.key}
            className={cn('relative border-l', col.today && 'bg-primary-soft/25')}
            style={{ height }}
          >
            {hours.slice(1).map((h) => (
              <div
                key={h}
                aria-hidden
                className="absolute inset-x-0 border-t border-dashed border-border/70"
                style={{ top: (h - firstHour) * HOUR_PX }}
              />
            ))}
            {items
              .filter((item) => item.column === index)
              .map((item) => {
                const place = layout.get(item.id) ?? { lane: 0, count: 1 };
                const style = {
                  top: top(item.start) + 1,
                  height: Math.max(22, top(item.end) - top(item.start) - 2),
                  left: `calc(${(place.lane / place.count) * 100}% + 3px)`,
                  width: `calc(${100 / place.count}% - 6px)`,
                  '--h': item.hue,
                } as CSSProperties;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={item.label}
                    onClick={item.onClick}
                    style={style}
                    className={cn(
                      'absolute flex flex-col overflow-hidden rounded-md border-l-[3px] px-2 py-1 text-left text-[12px] leading-tight shadow-[0_1px_2px_rgb(0_0_0/0.06)] transition-[filter] hover:brightness-[0.97]',
                      item.status === 'cancelled'
                        ? 'border-danger bg-danger-soft text-danger'
                        : 'border-[hsl(var(--h)_55%_40%)] bg-[hsl(var(--h)_70%_95%)] text-[hsl(var(--h)_50%_20%)] dark:bg-[hsl(var(--h)_28%_20%)] dark:text-[hsl(var(--h)_45%_88%)]',
                      item.status === 'moved-out' && 'border-dashed opacity-55',
                      item.status === 'moved-in' && 'ring-2 ring-warning/60',
                    )}
                  >
                    <span className="flex items-center gap-1 text-[11px] font-semibold opacity-80 tabular-nums">
                      {formatClock(item.start)}
                      {item.status && (
                        <span className="ml-auto rounded bg-current/10 px-1 text-[10px] font-bold">
                          {STATUS_LABEL[item.status]}
                        </span>
                      )}
                    </span>
                    <span
                      className={cn(
                        'truncate font-bold',
                        (item.status === 'cancelled' || item.status === 'moved-out') &&
                          'line-through',
                      )}
                    >
                      {item.title}
                    </span>
                    {item.lines.map((line) => (
                      <span key={line} className="truncate opacity-80">
                        {line}
                      </span>
                    ))}
                  </button>
                );
              })}
            {col.today &&
              nowMinutes !== undefined &&
              nowMinutes > firstHour * 60 &&
              nowMinutes < lastHour * 60 && (
                <div
                  aria-hidden
                  className="absolute inset-x-0 z-10 border-t-2 border-danger"
                  style={{ top: ((nowMinutes - firstHour * 60) / 60) * HOUR_PX }}
                >
                  <span className="absolute -top-[5px] -left-[5px] size-2 rounded-full bg-danger" />
                </div>
              )}
          </div>
        ))}
      </div>
      {!items.length && emptyHint && (
        <p className="border-t px-4 py-3 text-center text-[13px] text-muted-foreground">
          {emptyHint}
        </p>
      )}
    </div>
  );
}
