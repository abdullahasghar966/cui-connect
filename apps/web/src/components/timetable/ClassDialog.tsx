import {
  type ClassOccurrenceDTO,
  campusClock,
  classChangeSchema,
  formatShortDate,
  formatTimeRange,
} from '@cui/shared';
import {
  CalendarClock,
  CalendarX2,
  Clock,
  DoorOpen,
  MessagesSquare,
  RotateCcw,
  UserRound,
  Users,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';
import { Link } from 'react-router';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import { useRooms } from '@/hooks/academics';
import { useAction, useSubmit } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';

function Fact({ icon: Icon, children }: { icon: typeof Clock; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 text-[14px]">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

type Mode = 'view' | 'cancel' | 'move';

function CancelForm({
  occurrence,
  onBack,
  onDone,
}: {
  occurrence: ClassOccurrenceDTO;
  onBack: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState('');
  const cancel = useSubmit(
    classChangeSchema,
    (input) => api.academics.changeClass(occurrence.slot.id, input),
    {
      done: 'Class cancelled. Enrolled students were notified.',
      invalidate: [keys.timetable],
    },
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    cancel.run(
      { kind: 'cancelled', date: occurrence.date, note: note.trim() || undefined },
      onDone,
    );
  };
  return (
    <form onSubmit={submit} className="space-y-3 border-t pt-4">
      <Field
        label="Reason (optional)"
        htmlFor="cancel-note"
        hint="Shown to students in their notification"
      >
        <Input
          id="cancel-note"
          placeholder="e.g. I am attending a conference"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" variant="danger" loading={cancel.pending}>
          Cancel this class
        </Button>
      </div>
    </form>
  );
}

function MoveForm({
  occurrence,
  onBack,
  onDone,
}: {
  occurrence: ClassOccurrenceDTO;
  onBack: () => void;
  onDone: () => void;
}) {
  const { data: rooms } = useRooms();
  const [form, setForm] = useState({
    newDate: occurrence.date,
    newStart: occurrence.start,
    newEnd: occurrence.end,
    newRoomId: occurrence.room?.id ?? '',
    note: '',
  });
  const move = useSubmit(
    classChangeSchema,
    (input) => api.academics.changeClass(occurrence.slot.id, input),
    {
      done: 'Class moved. Enrolled students were notified.',
      invalidate: [keys.timetable],
    },
  );
  const set = (field: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    move.run(
      {
        kind: 'moved',
        date: occurrence.date,
        newDate: form.newDate,
        newStart: form.newStart,
        newEnd: form.newEnd,
        newRoomId: form.newRoomId || null,
        note: form.note.trim() || undefined,
      },
      onDone,
    );
  };
  return (
    <form onSubmit={submit} className="grid gap-3 border-t pt-4 sm:grid-cols-3">
      <Field label="New date" htmlFor="move-date">
        <Input
          id="move-date"
          type="date"
          min={campusClock().date}
          value={form.newDate}
          onChange={set('newDate')}
        />
      </Field>
      <Field label="Starts" htmlFor="move-start">
        <Input
          id="move-start"
          type="time"
          step={300}
          value={form.newStart}
          onChange={set('newStart')}
        />
      </Field>
      <Field label="Ends" htmlFor="move-end">
        <Input id="move-end" type="time" step={300} value={form.newEnd} onChange={set('newEnd')} />
      </Field>
      <Field label="Room" htmlFor="move-room" className="sm:col-span-3">
        <Select id="move-room" value={form.newRoomId} onChange={set('newRoomId')}>
          <option value="">No room</option>
          {rooms?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} · {r.block} ({r.capacity} seats)
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Note (optional)" htmlFor="move-note" className="sm:col-span-3">
        <Input id="move-note" value={form.note} onChange={set('note')} />
      </Field>
      <div className="flex justify-end gap-2 sm:col-span-3">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" loading={move.pending}>
          Move this class
        </Button>
      </div>
    </form>
  );
}

/** Details of one class on one date, with the instructor's controls. */
export function ClassDialog({
  occurrence,
  onClose,
}: {
  occurrence: ClassOccurrenceDTO | null;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>('view');
  const restore = useAction(
    (o: ClassOccurrenceDTO) =>
      api.academics.restoreClass(
        o.slot.id,
        o.status === 'moved-in' ? (o.movedFrom?.date ?? o.date) : o.date,
      ),
    { done: 'Change undone. Students were notified.', invalidate: [keys.timetable] },
  );
  const close = () => {
    setMode('view');
    onClose();
  };
  if (!occurrence) return null;
  const { slot } = occurrence;
  const upcoming = occurrence.date >= campusClock().date;
  const changed = occurrence.status !== 'scheduled';

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        title={`${slot.code} ${slot.title}`}
        description={`${slot.sectionName ?? ''} · ${slot.kind === 'lab' ? 'Lab' : 'Lecture'}`}
      >
        <div className="space-y-2.5">
          {occurrence.status === 'cancelled' && (
            <p className="rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-[13.5px] text-danger">
              Cancelled{occurrence.note ? `: ${occurrence.note}` : '.'}
            </p>
          )}
          {occurrence.status === 'moved-out' && occurrence.movedTo && (
            <p className="rounded-md border border-warning/25 bg-warning-soft px-3 py-2 text-[13.5px] text-warning">
              Moved to {formatShortDate(occurrence.movedTo.date)},{' '}
              {formatTimeRange(occurrence.movedTo.start, occurrence.movedTo.end)}.
              {occurrence.note ? ` ${occurrence.note}` : ''}
            </p>
          )}
          {occurrence.status === 'moved-in' && occurrence.movedFrom && (
            <p className="rounded-md border border-warning/25 bg-warning-soft px-3 py-2 text-[13.5px] text-warning">
              Moved here from {formatShortDate(occurrence.movedFrom.date)}.
              {occurrence.note ? ` ${occurrence.note}` : ''}
            </p>
          )}
          <Fact icon={Clock}>
            {formatShortDate(occurrence.date)}, {formatTimeRange(occurrence.start, occurrence.end)}
          </Fact>
          <Fact icon={DoorOpen}>
            {occurrence.room
              ? `${occurrence.room.name} · ${occurrence.room.block}`
              : 'Room to be announced'}
          </Fact>
          {slot.instructor && <Fact icon={UserRound}>{slot.instructor.name}</Fact>}
          <Fact icon={Users}>{slot.studentCount} students enrolled</Fact>
        </div>

        {mode === 'view' && (
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {slot.groupId && (
              <Link
                to={`/chat/${slot.groupId}`}
                onClick={close}
                className={buttonVariants({ variant: 'outline' })}
              >
                <MessagesSquare /> Open course chat
              </Link>
            )}
            {occurrence.canChange && upcoming && !changed && (
              <>
                <Button variant="outline" onClick={() => setMode('move')}>
                  <CalendarClock /> Move
                </Button>
                <Button variant="outline" onClick={() => setMode('cancel')}>
                  <CalendarX2 /> Cancel class
                </Button>
              </>
            )}
            {occurrence.canChange && changed && upcoming && (
              <Button
                variant="outline"
                loading={restore.isPending}
                onClick={() => restore.mutate(occurrence, { onSuccess: close })}
              >
                <RotateCcw /> Undo change
              </Button>
            )}
          </div>
        )}
        {mode === 'cancel' && (
          <CancelForm occurrence={occurrence} onBack={() => setMode('view')} onDone={close} />
        )}
        {mode === 'move' && (
          <MoveForm occurrence={occurrence} onBack={() => setMode('view')} onDone={close} />
        )}
      </DialogContent>
    </Dialog>
  );
}
