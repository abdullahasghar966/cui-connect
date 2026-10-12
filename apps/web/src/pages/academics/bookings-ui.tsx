/** Booking office hours (students) and the list of appointments (students and teachers). */
import {
  type BookingDTO,
  bookingSchema,
  campusClock,
  formatClock,
  formatShortDate,
  formatTimeRange,
  type TeacherDTO,
  toMinutes,
} from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, MapPin } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { EmptyState, Spinner } from '@/components/feedback';
import { Card } from '@/components/page';
import { Avatar } from '@/components/people';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/form';
import { useCurrentUser } from '@/hooks/queries';
import { useAction, useSubmit } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { cn } from '@/lib/utils';

/** Still ahead of us (not started yet). */
export const isUpcoming = (b: Pick<BookingDTO, 'date' | 'start' | 'status'>) => {
  const clock = campusClock();
  return (
    b.status === 'booked' &&
    (b.date > clock.date || (b.date === clock.date && toMinutes(b.start) > clock.minutes))
  );
};

export function BookingDialog({ teacher, onClose }: { teacher: TeacherDTO; onClose: () => void }) {
  const slots = useQuery({
    queryKey: keys.slots(teacher.user.id),
    queryFn: () => api.academics.teacherSlots(teacher.user.id),
  });
  const [picked, setPicked] = useState<{ date: string; start: string } | null>(null);
  const [topic, setTopic] = useState('');
  const book = useSubmit(bookingSchema, (input) => api.academics.book(input), {
    done: (b) =>
      `Booked: ${formatShortDate(b.date)} at ${formatClock(b.start)} with ${b.teacher.name}`,
    invalidate: [keys.bookings, keys.slots(teacher.user.id), ['academics', 'calendar']],
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!picked) return;
    book.run({ teacherId: teacher.user.id, ...picked, topic }, onClose);
  };
  const data = slots.data;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        wide
        title={`Book office hours with ${teacher.user.name}`}
        description={
          teacher.officeLocation
            ? `15-minute appointments in ${teacher.officeLocation}, over the next two weeks.`
            : '15-minute appointments over the next two weeks.'
        }
      >
        {!data ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : !data.canBook ? (
          <p className="rounded-md border bg-surface-2 px-3 py-2 text-[13.5px] text-muted-foreground">
            {data.reason}
          </p>
        ) : !data.days.length ? (
          <p className="text-[13.5px] text-muted-foreground">
            No office hours in the next two weeks.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
              {data.days.map((day) => (
                <fieldset key={day.date}>
                  <legend className="mb-1.5 text-[13px] font-bold">
                    {formatShortDate(day.date)}
                  </legend>
                  <div className="flex flex-wrap gap-1.5">
                    {day.slots.map((slot) => {
                      const on = picked?.date === day.date && picked.start === slot.start;
                      return (
                        <button
                          key={slot.start}
                          type="button"
                          disabled={slot.taken}
                          aria-pressed={on}
                          aria-label={`${formatShortDate(day.date)} at ${formatClock(slot.start)}${
                            slot.mine ? ' (yours)' : slot.taken ? ' (taken)' : ''
                          }`}
                          onClick={() => setPicked({ date: day.date, start: slot.start })}
                          className={cn(
                            'h-8 rounded-md border px-2.5 text-[13px] font-semibold tabular-nums transition-colors',
                            on
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border-strong bg-surface hover:bg-muted',
                            slot.taken && 'cursor-not-allowed opacity-45 line-through',
                            slot.mine &&
                              'border-primary/40 bg-primary-soft text-primary opacity-100 no-underline',
                          )}
                        >
                          {formatClock(slot.start)}
                          {slot.mine && ' · yours'}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
            <Field label="What would you like to discuss?" htmlFor="booking-topic">
              <Input
                id="booking-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Feedback on my Assignment 2"
              />
            </Field>
            <div className="flex items-center justify-end gap-2">
              <span className="mr-auto text-[13px] text-muted-foreground">
                {picked
                  ? `${formatShortDate(picked.date)} at ${formatClock(picked.start)}`
                  : 'Pick a time'}
              </span>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!picked} loading={book.pending}>
                Book
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ booking, onClose }: { booking: BookingDTO; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const cancel = useAction(() => api.academics.cancelBooking(booking.id, reason.trim() || null), {
    done: 'Appointment cancelled. The other person was told.',
    invalidate: [keys.bookings, ['academics', 'slots'], ['academics', 'calendar']],
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Cancel this appointment?"
        description={`${formatShortDate(booking.date)} at ${formatClock(booking.start)}. The other person is told, and the time becomes free again.`}
      >
        <div className="space-y-3">
          <Field label="Reason (optional)" htmlFor="cancel-reason">
            <Input
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. A faculty meeting came up"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={cancel.isPending}
              onClick={() => cancel.mutate(undefined, { onSuccess: onClose })}
            >
              Cancel appointment
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BookingRow({ booking, onCancel }: { booking: BookingDTO; onCancel?: () => void }) {
  const me = useCurrentUser();
  const teacherView = me.id === booking.teacher.id;
  const other = teacherView ? booking.student : booking.teacher;
  const cancelled = booking.status === 'cancelled';
  return (
    <li className={cn('flex items-center gap-3 px-4 py-3', !onCancel && 'opacity-70')}>
      <Avatar name={other.name} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 text-[14px] font-bold">
          {other.name}
          {teacherView && booking.student.regNo && (
            <span className="font-mono text-[12px] font-normal text-muted-foreground">
              {booking.student.regNo}
            </span>
          )}
          {cancelled && (
            <Badge tone="danger">
              Cancelled
              {booking.cancelledBy === (teacherView ? 'teacher' : 'student') ? ' by you' : ''}
            </Badge>
          )}
        </span>
        <span className="block text-[13px] tabular-nums">
          {formatShortDate(booking.date)} · {formatTimeRange(booking.start, booking.end)}
        </span>
        <span className="block truncate text-[12.5px] text-muted-foreground">
          {booking.topic}
          {cancelled && booking.cancelReason ? ` · ${booking.cancelReason}` : ''}
        </span>
        {booking.location && !teacherView && !cancelled && (
          <span className="flex items-center gap-1 text-[12.5px] text-muted-foreground">
            <MapPin className="size-3" aria-hidden /> {booking.location}
          </span>
        )}
      </span>
      {onCancel && (
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </li>
  );
}

/** Upcoming appointments first, then the last two weeks' (and cancelled ones). */
export function Appointments() {
  const me = useCurrentUser();
  const query = useQuery({ queryKey: keys.bookings, queryFn: api.academics.bookings });
  const [cancelling, setCancelling] = useState<BookingDTO | null>(null);
  if (!query.data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  const upcoming = query.data.filter(isUpcoming);
  const earlier = query.data.filter((b) => !isUpcoming(b)).reverse();
  return (
    <div className="space-y-5">
      <Card
        title="Upcoming"
        description={
          me.role === 'faculty'
            ? 'Students who booked your office hours. They are reminded on the morning of the day.'
            : 'Your office-hour appointments. Book from a teacher’s card on the Directory tab.'
        }
      >
        {upcoming.length ? (
          <ul className="divide-y">
            {upcoming.map((b) => (
              <BookingRow key={b.id} booking={b} onCancel={() => setCancelling(b)} />
            ))}
          </ul>
        ) : (
          <EmptyState icon={CalendarClock} title="No upcoming appointments" className="py-8" />
        )}
      </Card>
      {earlier.length > 0 && (
        <Card title="Earlier and cancelled">
          <ul className="divide-y">
            {earlier.map((b) => (
              <BookingRow key={b.id} booking={b} />
            ))}
          </ul>
        </Card>
      )}
      {cancelling && <CancelDialog booking={cancelling} onClose={() => setCancelling(null)} />}
    </div>
  );
}
