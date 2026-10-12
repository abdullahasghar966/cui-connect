/** Pieces of the events pages: the date block, RSVP buttons, an event card and its form. */
import {
  addDays,
  type CampusEventDTO,
  campusClock,
  campusEventSchema,
  EVENT_CATEGORIES,
  EVENT_CATEGORY_LABELS,
  EVENT_STATUS_LABELS,
  type EventCategory,
  formatClock,
  type RsvpStatus,
  seatsLeft,
} from '@cui/shared';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, Clock, MapPin, Star, Users } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { useAction, useSubmit } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { cn } from '@/lib/utils';

const monthDay = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });
const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' });

/** "OCT / 21 / Wed" calendar-page block. */
export function DateBlock({ date, muted }: { date: string; muted?: boolean }) {
  const d = new Date(`${date}T00:00:00Z`);
  return (
    <span
      className={cn(
        'flex w-14 shrink-0 flex-col items-center rounded-lg border py-1.5 leading-none',
        muted ? 'bg-surface-2 text-muted-foreground' : 'border-primary/25 bg-primary-soft',
      )}
      aria-hidden
    >
      <span className="text-[11px] font-bold text-primary uppercase dark:text-link">
        {monthDay.format(d)}
      </span>
      <span className="my-0.5 text-[20px] font-bold tabular-nums">{d.getUTCDate()}</span>
      <span className="text-[11px] text-muted-foreground">{weekday.format(d)}</span>
    </span>
  );
}

export function EventStatusBadge({ event }: { event: CampusEventDTO }) {
  if (event.status === 'published') return null;
  const tone =
    event.status === 'pending' ? 'warning' : event.status === 'cancelled' ? 'danger' : 'outline';
  return <Badge tone={tone}>{EVENT_STATUS_LABELS[event.status]}</Badge>;
}

const isPast = (event: CampusEventDTO) => event.date < campusClock().date;

/** "Going" and "Interested" toggles (pressing the chosen one again takes it back). */
export function RsvpButtons({ event, size = 'sm' }: { event: CampusEventDTO; size?: 'sm' | 'md' }) {
  const qc = useQueryClient();
  const answer = useAction((status: RsvpStatus | null) => api.campus.rsvp(event.id, status), {
    invalidate: [keys.campusEvents, ['academics', 'calendar']],
  });
  const left = seatsLeft(event);
  const full = left === 0 && event.myRsvp !== 'going';
  const closed = event.status !== 'published' || isPast(event);
  const set = (status: RsvpStatus) =>
    answer.mutate(event.myRsvp === status ? null : status, {
      onSuccess: (dto) =>
        qc.setQueryData(keys.campusEvent(event.id), (old: object | undefined) =>
          old ? { ...old, ...dto } : old,
        ),
    });
  if (closed) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      <Button
        size={size}
        variant={event.myRsvp === 'going' ? 'primary' : 'outline'}
        aria-pressed={event.myRsvp === 'going'}
        aria-label={`Going to ${event.title}`}
        disabled={answer.isPending || full}
        onClick={() => set('going')}
      >
        <CalendarCheck /> {full ? 'Full' : 'Going'}
      </Button>
      <Button
        size={size}
        variant={event.myRsvp === 'interested' ? 'primary' : 'outline'}
        aria-pressed={event.myRsvp === 'interested'}
        aria-label={`Interested in ${event.title}`}
        disabled={answer.isPending}
        onClick={() => set('interested')}
      >
        <Star /> Interested
      </Button>
    </div>
  );
}

export function attendance(event: CampusEventDTO): string {
  const left = seatsLeft(event);
  return [
    `${event.going} going`,
    event.interested ? `${event.interested} interested` : null,
    left === null ? null : left === 0 ? 'full' : `${left} place${left === 1 ? '' : 's'} left`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** One event in a list. */
export function EventCard({ event }: { event: CampusEventDTO }) {
  const past = isPast(event);
  return (
    <li className="flex gap-3 px-4 py-3">
      <DateBlock date={event.date} muted={past || event.status === 'cancelled'} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            to={`/campus/events/${event.id}`}
            className={cn(
              'text-[15px] font-bold hover:underline',
              event.status === 'cancelled' && 'line-through',
            )}
          >
            {event.title}
          </Link>
          <Badge tone="neutral">{EVENT_CATEGORY_LABELS[event.category]}</Badge>
          <EventStatusBadge event={event} />
        </p>
        <p className="mt-0.5 flex flex-wrap gap-x-3 text-[12.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden />
            {formatClock(event.start)}–{formatClock(event.end)}
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden />
            {event.venue}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" aria-hidden />
            {attendance(event)}
          </span>
        </p>
        <p className="text-[12.5px] text-muted-foreground">By {event.organiser}</p>
        {!past && (
          <div className="mt-2">
            <RsvpButtons event={event} />
          </div>
        )}
      </div>
    </li>
  );
}

/** Create or edit an event. Students' and teachers' events go to Student Affairs first. */
export function EventDialog({
  event,
  direct,
  onClose,
}: {
  event: CampusEventDTO | null;
  direct: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: event?.title ?? '',
    description: event?.description ?? '',
    category: (event?.category ?? 'seminar') as EventCategory,
    date: event?.date ?? addDays(campusClock().date, 7),
    start: event?.start ?? '14:00',
    end: event?.end ?? '15:30',
    venue: event?.venue ?? '',
    organiser: event?.organiser ?? '',
    capacity: event?.capacity ? String(event.capacity) : '',
  });
  const set = (field: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));
  const save = useSubmit(campusEventSchema, (input) => api.campus.saveEvent(input, event?.id), {
    done: (saved) =>
      event
        ? 'Event updated'
        : saved.status === 'published'
          ? 'Event published'
          : 'Sent to Student Affairs for approval',
    invalidate: [keys.campusEvents],
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.run({ ...form, capacity: form.capacity ? Number(form.capacity) : null }, (saved) => {
      onClose();
      if (!event) navigate(`/campus/events/${saved.id}`);
    });
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        wide
        title={event ? `Edit ${event.title}` : 'New event'}
        description={
          event || direct
            ? 'Everyone on campus can see it and answer.'
            : 'Student Affairs checks events by students and teachers before they are published. You are told when they decide.'
        }
      >
        <form onSubmit={submit} className="space-y-3">
          <Field label="Title" htmlFor="event-title">
            <Input id="event-title" value={form.title} onChange={set('title')} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kind" htmlFor="event-category">
              <Select id="event-category" value={form.category} onChange={set('category')}>
                {EVENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {EVENT_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Organised by" htmlFor="event-organiser">
              <Input
                id="event-organiser"
                value={form.organiser}
                onChange={set('organiser')}
                placeholder="e.g. ACM Student Chapter"
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Date" htmlFor="event-date">
              <Input
                id="event-date"
                type="date"
                min={campusClock().date}
                value={form.date}
                onChange={set('date')}
              />
            </Field>
            <Field label="Starts" htmlFor="event-start">
              <Input id="event-start" type="time" value={form.start} onChange={set('start')} />
            </Field>
            <Field label="Ends" htmlFor="event-end">
              <Input id="event-end" type="time" value={form.end} onChange={set('end')} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <Field label="Where" htmlFor="event-venue">
              <Input
                id="event-venue"
                value={form.venue}
                onChange={set('venue')}
                placeholder="e.g. Seminar Hall, Academic Block II"
              />
            </Field>
            <Field label="Places (optional)" htmlFor="event-capacity" hint="Empty: no limit">
              <Input
                id="event-capacity"
                type="number"
                min={1}
                value={form.capacity}
                onChange={set('capacity')}
              />
            </Field>
          </div>
          <Field label="About the event" htmlFor="event-description">
            <Textarea
              id="event-description"
              rows={4}
              value={form.description}
              onChange={set('description')}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.pending}>
              {event ? 'Save changes' : direct ? 'Publish event' : 'Send for approval'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
