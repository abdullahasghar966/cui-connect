import {
  addDays,
  campusClock,
  EVENT_CATEGORY_LABELS,
  formatClock,
  formatShortDate,
} from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarHeart, Check, Clock, MapPin, Pencil, Users, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { EmptyState, Spinner } from '@/components/feedback';
import { Card } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/form';
import { useAction } from '@/hooks/useSubmit';
import { ApiError, api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { attendance, DateBlock, EventDialog, EventStatusBadge, RsvpButtons } from './events-ui';

const longDate = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** One event: details, answering, and the organiser's and Student Affairs' controls. */
export default function EventPage() {
  const { eventId = '' } = useParams();
  const query = useQuery({
    queryKey: keys.campusEvent(eventId),
    queryFn: () => api.campus.event(eventId),
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
  });
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState<'reject' | 'cancel' | null>(null);
  const [note, setNote] = useState('');
  const refresh = [keys.campusEvents, ['academics', 'calendar']];
  const decide = useAction(
    (approve: boolean) => api.campus.decideEvent(eventId, approve, note.trim() || null),
    {
      done: (e) => (e.status === 'published' ? 'Event published' : 'The organiser was told'),
      invalidate: refresh,
    },
  );
  const cancel = useAction(() => api.campus.cancelEvent(eventId, note.trim() || null), {
    done: 'Event cancelled. Everyone who answered was told.',
    invalidate: refresh,
  });
  const event = query.data;

  const back = (
    <Link
      to="/campus/events"
      className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-link hover:underline"
    >
      <ArrowLeft className="size-3.5" aria-hidden /> Events
    </Link>
  );
  if (query.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (!event) {
    return (
      <>
        {back}
        <EmptyState icon={CalendarHeart} title="Can't open this event">
          {query.error instanceof ApiError ? query.error.message : 'Try again in a moment.'}
        </EmptyState>
      </>
    );
  }
  const open = event.status === 'published' || event.status === 'pending';
  const answerable = event.status === 'published' && event.date >= campusClock().date;
  const close = () => {
    setAsking(null);
    setNote('');
  };
  return (
    <>
      {back}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <div className="flex gap-4 px-5 py-5">
            <DateBlock date={event.date} muted={event.status === 'cancelled'} />
            <div className="min-w-0 flex-1">
              <p className="mb-1 flex flex-wrap gap-1.5">
                <Badge tone="neutral">{EVENT_CATEGORY_LABELS[event.category]}</Badge>
                <EventStatusBadge event={event} />
              </p>
              <h1 className="text-[22px] leading-tight font-bold">{event.title}</h1>
              <p className="mt-0.5 text-[13.5px] text-muted-foreground">By {event.organiser}</p>
            </div>
          </div>
          <dl className="grid gap-2 border-t px-5 py-4 text-[13.5px]">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground" aria-hidden />
              <dt className="sr-only">When</dt>
              <dd>
                {longDate.format(new Date(`${event.date}T00:00:00Z`))}, {formatClock(event.start)}–
                {formatClock(event.end)}
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="size-4 text-muted-foreground" aria-hidden />
              <dt className="sr-only">Where</dt>
              <dd>{event.venue}</dd>
            </div>
            <div className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" aria-hidden />
              <dt className="sr-only">Who is coming</dt>
              <dd>{attendance(event)}</dd>
            </div>
          </dl>
          {event.note && (
            <p className="mx-5 mb-4 rounded-md bg-surface-2 px-3 py-2 text-[13px]">
              <span className="font-semibold">
                {event.status === 'cancelled' ? 'Why it was cancelled:' : 'Student Affairs:'}
              </span>{' '}
              {event.note}
            </p>
          )}
          <p className="border-t px-5 py-4 text-[14px] whitespace-pre-line">{event.description}</p>
          {answerable && (
            <div className="border-t px-5 py-4">
              <RsvpButtons event={event} size="md" />
            </div>
          )}
        </Card>

        <div className="space-y-5">
          {event.canModerate && event.status === 'pending' && (
            <Card
              title="Waiting for your approval"
              description={`Proposed by ${event.createdBy.name}`}
            >
              <div className="flex flex-wrap gap-2 px-4 py-3">
                <Button loading={decide.isPending} onClick={() => decide.mutate(true)}>
                  <Check /> Approve and publish
                </Button>
                <Button variant="outline" onClick={() => setAsking('reject')}>
                  <X /> Don't approve
                </Button>
              </div>
            </Card>
          )}
          {event.canEdit && open && (
            <Card title="Organiser">
              <div className="flex flex-wrap gap-2 px-4 py-3">
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Pencil /> Edit
                </Button>
                <Button variant="outline" onClick={() => setAsking('cancel')}>
                  Cancel event
                </Button>
              </div>
            </Card>
          )}
          {event.attendees && (
            <Card title={`Going (${event.attendees.length})`}>
              {!event.attendees.length ? (
                <p className="px-4 py-3 text-[13px] text-muted-foreground">Nobody yet.</p>
              ) : (
                <ul className="max-h-80 divide-y overflow-y-auto">
                  {event.attendees.map((a) => (
                    <li key={a.id} className="px-4 py-2 text-[13px]">
                      <span className="font-semibold">{a.name}</span>
                      {a.detail && <span className="block text-muted-foreground">{a.detail}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          <p className="px-1 text-[12.5px] text-muted-foreground">
            Added by {event.createdBy.name}.
            {answerable &&
              ` People going get a reminder the evening before (${formatShortDate(addDays(event.date, -1))}).`}
          </p>
        </div>
      </div>

      {editing && <EventDialog event={event} direct onClose={() => setEditing(false)} />}
      <Dialog open={!!asking} onOpenChange={(o) => !o && close()}>
        <DialogContent
          title={asking === 'reject' ? `Don't approve ${event.title}?` : `Cancel ${event.title}?`}
          description={
            asking === 'reject'
              ? 'The organiser is told why, so they can fix it and try again.'
              : 'Everyone who said they are going or interested is told.'
          }
        >
          <div className="space-y-3">
            <Field
              label={asking === 'reject' ? 'Why not?' : 'Reason (optional)'}
              htmlFor="event-note"
            >
              <Textarea
                id="event-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={close}>
                Back
              </Button>
              <Button
                variant="danger"
                loading={decide.isPending || cancel.isPending}
                onClick={() =>
                  asking === 'reject'
                    ? decide.mutate(false, { onSuccess: close })
                    : cancel.mutate(undefined, { onSuccess: close })
                }
              >
                {asking === 'reject' ? "Don't approve" : 'Cancel event'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
