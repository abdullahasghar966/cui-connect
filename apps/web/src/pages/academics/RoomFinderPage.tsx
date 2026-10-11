import {
  campusClock,
  formatClock,
  formatShortDate,
  formatTimeRange,
  fromMinutes,
  ROOM_KIND_LABELS,
  ROOM_KINDS,
  type RoomKind,
  type RoomStatusDTO,
  toMinutes,
} from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronDown, DoorOpen } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { EmptyState, Spinner } from '@/components/feedback';
import { PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const NEEDS = [0, 30, 60, 90, 120, 180] as const;

/** Minutes the room stays free from `time` (Infinity = the rest of the day). */
function freeFor(status: RoomStatusDTO, time: string): number {
  if (status.current) return 0;
  return status.freeUntil
    ? toMinutes(status.freeUntil) - toMinutes(time)
    : Number.POSITIVE_INFINITY;
}

function RoomRow({ status, time, date }: { status: RoomStatusDTO; time: string; date: string }) {
  const [open, setOpen] = useState(false);
  const { room, current } = status;
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2"
      >
        <span
          aria-hidden
          className={cn('size-2.5 shrink-0 rounded-full', current ? 'bg-danger' : 'bg-online')}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-bold">
            {room.name}{' '}
            <span className="font-normal text-muted-foreground">
              · {room.block}
              {room.floor !== null ? ` · floor ${room.floor}` : ''}
            </span>
          </span>
          <span className="block text-[12.5px] text-muted-foreground">
            {ROOM_KIND_LABELS[room.kind]} · {room.capacity} seats
          </span>
        </span>
        <span className="text-right text-[13px]">
          {current ? (
            <>
              <span className="block font-semibold">
                {current.kind === 'exam' ? 'Exam: ' : ''}
                {current.title}
              </span>
              <span className="block text-[12px] text-muted-foreground">
                until {formatClock(current.end)}
              </span>
            </>
          ) : (
            <Badge tone="success">
              {status.freeUntil
                ? `Free until ${formatClock(status.freeUntil)}`
                : 'Free for the rest of the day'}
            </Badge>
          )}
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
        <div className="border-t bg-surface-2 px-4 py-3">
          {status.bookings.length ? (
            <ol
              className="space-y-1 text-[13px]"
              aria-label={`${room.name} on ${formatShortDate(date)}`}
            >
              {status.bookings.map((b) => {
                const now =
                  toMinutes(b.start) <= toMinutes(time) && toMinutes(time) < toMinutes(b.end);
                return (
                  <li
                    key={`${b.start}-${b.title}`}
                    className={cn('flex gap-3', now && 'font-semibold')}
                  >
                    <span className="w-36 shrink-0 tabular-nums">
                      {formatTimeRange(b.start, b.end)}
                    </span>
                    <span className="min-w-0">
                      {b.kind === 'exam' && (
                        <Badge tone="warning" className="mr-1">
                          Exam
                        </Badge>
                      )}
                      {b.title} <span className="text-muted-foreground">· {b.detail}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              Nothing booked on {formatShortDate(date)}.
            </p>
          )}
          <Link
            to={`/academics/timetable?view=room&id=${room.id}&week=${date}`}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-3')}
          >
            <CalendarDays /> Week view
          </Link>
        </div>
      )}
    </li>
  );
}

/** Which rooms are free now (or at any date and time), and until when. */
export default function RoomFinderPage() {
  const clock = campusClock();
  const [params, setParams] = useSearchParams();
  const date = params.get('date') ?? clock.date;
  const time = params.get('time') ?? fromMinutes(clock.minutes);
  const kind = (params.get('kind') as RoomKind | null) ?? '';
  const seats = Number(params.get('seats') ?? 0);
  const need = Number(params.get('need') ?? 0);
  const live = !params.get('date') && !params.get('time');

  const finder = useQuery({
    queryKey: ['academics', 'rooms', 'finder', date, time],
    queryFn: () => api.academics.roomFinder({ date, time }),
    placeholderData: (previous) => previous,
    // Following "now": refresh every minute.
    refetchInterval: live ? 60_000 : false,
  });

  const update = (next: Record<string, string>) => {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) merged.set(key, value);
      else merged.delete(key);
    }
    setParams(merged, { replace: true });
  };

  const rooms = (finder.data?.rooms ?? []).filter(
    (r) => (!kind || r.room.kind === kind) && r.room.capacity >= seats,
  );
  const free = rooms.filter((r) => freeFor(r, time) >= Math.max(1, need));
  const busy = rooms.filter((r) => !free.includes(r));

  return (
    <>
      <PageHeader
        title="Room finder"
        description="Free rooms and what's on in each, from the timetable (including one-off cancellations and moves) and the exam date sheet."
      />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="flex items-end gap-2">
          <Field label="Date" htmlFor="rf-date">
            <Input
              id="rf-date"
              type="date"
              value={date}
              onChange={(e) => update({ date: e.target.value })}
              className="w-40"
            />
          </Field>
          <Field label="Time" htmlFor="rf-time">
            <Input
              id="rf-time"
              type="time"
              value={time}
              onChange={(e) => update({ time: e.target.value })}
              className="w-32"
            />
          </Field>
          <Button variant="outline" disabled={live} onClick={() => update({ date: '', time: '' })}>
            Now
          </Button>
        </div>
        <Field label="Free for at least" htmlFor="rf-need">
          <Select
            id="rf-need"
            value={String(need)}
            onChange={(e) => update({ need: e.target.value === '0' ? '' : e.target.value })}
            className="w-36"
          >
            {NEEDS.map((n) => (
              <option key={n} value={n}>
                {n === 0
                  ? 'Any time'
                  : n < 60
                    ? `${n} minutes`
                    : `${n / 60} hour${n === 60 ? '' : 's'}`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Kind" htmlFor="rf-kind">
          <Select
            id="rf-kind"
            value={kind}
            onChange={(e) => update({ kind: e.target.value })}
            className="w-36"
          >
            <option value="">All rooms</option>
            {ROOM_KINDS.map((k) => (
              <option key={k} value={k}>
                {ROOM_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Seats" htmlFor="rf-seats">
          <Input
            id="rf-seats"
            type="number"
            min={0}
            placeholder="Any"
            value={seats || ''}
            onChange={(e) => update({ seats: e.target.value })}
            className="w-24"
          />
        </Field>
      </div>

      {finder.isPending ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !rooms.length ? (
        <EmptyState
          icon={DoorOpen}
          title="No rooms match"
          className="rounded-lg border bg-surface"
        />
      ) : (
        <div className="space-y-5">
          <section aria-label="Free rooms">
            <h2 className="mb-2 text-[14px] font-bold">
              Free at {formatClock(time)}
              {date !== clock.date ? ` on ${formatShortDate(date)}` : ''}{' '}
              <span className="font-normal text-muted-foreground">
                · {free.length} of {rooms.length}
              </span>
            </h2>
            {free.length ? (
              <ul className="divide-y overflow-hidden rounded-lg border bg-surface">
                {free.map((r) => (
                  <RoomRow key={r.room.id} status={r} time={time} date={date} />
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border bg-surface px-4 py-6 text-center text-[13.5px] text-muted-foreground">
                No room is free for that long at {formatClock(time)}.
              </p>
            )}
          </section>
          {busy.length > 0 && (
            <section aria-label="Rooms in use">
              <h2 className="mb-2 text-[14px] font-bold">
                In use <span className="font-normal text-muted-foreground">· {busy.length}</span>
              </h2>
              <ul className="divide-y overflow-hidden rounded-lg border bg-surface">
                {busy.map((r) => (
                  <RoomRow key={r.room.id} status={r} time={time} date={date} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}
