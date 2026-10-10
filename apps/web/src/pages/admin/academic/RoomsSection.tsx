import { ROOM_KIND_LABELS, ROOM_KINDS, type RoomDTO, type RoomKind, roomSchema } from '@cui/shared';
import { DoorOpen, Ellipsis, Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { EmptyState, Spinner } from '@/components/feedback';
import { Card, Table } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/menu';
import { useRooms } from '@/hooks/academics';
import { useAction, useSubmit } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';

const EMPTY = {
  name: '',
  block: '',
  floor: '',
  kind: 'classroom' as RoomKind,
  capacity: '40',
  examRows: '0',
  examCols: '0',
};

function RoomDialog({ room, onClose }: { room: RoomDTO | 'new' | null; onClose: () => void }) {
  const editing = room && room !== 'new' ? room : null;
  const [form, setForm] = useState(
    editing
      ? {
          name: editing.name,
          block: editing.block,
          floor: editing.floor === null ? '' : String(editing.floor),
          kind: editing.kind,
          capacity: String(editing.capacity),
          examRows: String(editing.examRows),
          examCols: String(editing.examCols),
        }
      : EMPTY,
  );
  const save = useSubmit(
    roomSchema,
    (input) => (editing ? api.admin.updateRoom(editing.id, input) : api.admin.createRoom(input)),
    { done: (r) => `${r.name} saved`, invalidate: [keys.rooms, ['admin']] },
  );
  const set = (field: keyof typeof EMPTY) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.run(
      {
        name: form.name,
        block: form.block,
        floor: form.floor.trim() === '' ? null : Number(form.floor),
        kind: form.kind,
        capacity: Number(form.capacity),
        examRows: Number(form.examRows || 0),
        examCols: Number(form.examCols || 0),
      },
      onClose,
    );
  };
  const seats = Number(form.examRows || 0) * Number(form.examCols || 0);

  return (
    <Dialog open={!!room} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={editing ? `Edit ${editing.name}` : 'Add a room'}
        description="Classrooms and labs are used by the timetable; rooms with exam seating can host exams."
      >
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="room-name">
            <Input
              id="room-name"
              placeholder="A-101 or Lab 3"
              value={form.name}
              onChange={set('name')}
            />
          </Field>
          <Field label="Block" htmlFor="room-block">
            <Input
              id="room-block"
              placeholder="Academic Block I"
              value={form.block}
              onChange={set('block')}
            />
          </Field>
          <Field label="Type" htmlFor="room-kind">
            <Select id="room-kind" value={form.kind} onChange={set('kind')}>
              {ROOM_KINDS.map((k) => (
                <option key={k} value={k}>
                  {ROOM_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Floor" htmlFor="room-floor" hint="Leave empty if not applicable">
            <Input id="room-floor" inputMode="numeric" value={form.floor} onChange={set('floor')} />
          </Field>
          <Field label="Capacity" htmlFor="room-capacity">
            <Input
              id="room-capacity"
              inputMode="numeric"
              value={form.capacity}
              onChange={set('capacity')}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Exam rows" htmlFor="room-rows">
              <Input
                id="room-rows"
                inputMode="numeric"
                value={form.examRows}
                onChange={set('examRows')}
              />
            </Field>
            <Field label="Seats per row" htmlFor="room-cols">
              <Input
                id="room-cols"
                inputMode="numeric"
                value={form.examCols}
                onChange={set('examCols')}
              />
            </Field>
          </div>
          <p className="text-[13px] text-muted-foreground sm:col-span-2">
            {seats
              ? `Exam seating: ${seats} seats (${form.examRows} rows × ${form.examCols}).`
              : 'Not used for exams (0 exam rows).'}
          </p>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.pending}>
              {editing ? 'Save changes' : 'Add room'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RoomsSection() {
  const { data: rooms, isPending } = useRooms();
  const [editing, setEditing] = useState<RoomDTO | 'new' | null>(null);
  const remove = useAction((room: RoomDTO) => api.admin.deleteRoom(room.id), {
    done: 'Room removed',
    invalidate: [keys.rooms, ['admin']],
  });

  return (
    <Card
      title="Rooms"
      description="Classrooms, labs and exam halls."
      actions={
        <Button onClick={() => setEditing('new')}>
          <Plus /> Add room
        </Button>
      }
    >
      {isPending ? (
        <div className="p-5">
          <Spinner />
        </div>
      ) : !rooms?.length ? (
        <EmptyState icon={DoorOpen} title="No rooms yet">
          Add classrooms and labs before building the timetable.
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Room</th>
              <th>Block</th>
              <th>Type</th>
              <th className="text-right">Capacity</th>
              <th className="text-right">Exam seats</th>
              <th className="w-10">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={room.id}>
                <td className="font-semibold whitespace-nowrap">{room.name}</td>
                <td className="text-muted-foreground">
                  {room.block}
                  {room.floor !== null && ` · floor ${room.floor}`}
                </td>
                <td>
                  <Badge tone={room.kind === 'hall' ? 'primary' : 'neutral'}>
                    {ROOM_KIND_LABELS[room.kind]}
                  </Badge>
                </td>
                <td className="text-right tabular-nums">{room.capacity}</td>
                <td className="text-right text-muted-foreground tabular-nums">
                  {room.examRows * room.examCols || '—'}
                </td>
                <td>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Actions for ${room.name}`}
                      >
                        <Ellipsis />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onSelect={() => setEditing(room)}>
                        <Pencil /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem danger onSelect={() => remove.mutate(room)}>
                        <Trash2 /> Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {editing && (
        <RoomDialog
          key={editing === 'new' ? 'new' : editing.id}
          room={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}
