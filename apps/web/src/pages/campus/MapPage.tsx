import {
  type CampusPlaceDTO,
  campusPlaceSchema,
  describeHours,
  formatClock,
  OFFICE_LABELS,
  OFFICES,
  type Office,
  type PlaceKind,
  ROOM_KIND_LABELS,
  type RoomStatusDTO,
} from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  DoorOpen,
  Ellipsis,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { EmptyState, Spinner } from '@/components/feedback';
import { Card, PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/menu';
import { useAction, useSubmit } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { cn } from '@/lib/utils';

const FLOOR_NAMES = ['Ground floor', '1st floor', '2nd floor', '3rd floor'];
export const floorName = (floor: number | null) =>
  floor === null
    ? null
    : floor < 0
      ? `Basement ${-floor}`
      : (FLOOR_NAMES[floor] ?? `${floor}th floor`);

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-');

interface Block {
  name: string;
  places: CampusPlaceDTO[];
  rooms: RoomStatusDTO[];
}

function roomStatus(r: RoomStatusDTO) {
  if (r.current) {
    return {
      busy: true,
      text: `${r.current.kind === 'exam' ? 'Exam: ' : ''}${r.current.title.split(' ')[0]} · ${r.current.detail.split(' · ')[0]} until ${formatClock(r.current.end)}`,
    };
  }
  return {
    busy: false,
    text: r.freeUntil ? `Free until ${formatClock(r.freeUntil)}` : 'Free for the rest of the day',
  };
}

function OpenBadge({ place }: { place: CampusPlaceDTO }) {
  if (place.openNow === null) return null;
  return place.openNow ? (
    <Badge tone="success">Open now</Badge>
  ) : (
    <Badge tone="outline">Closed</Badge>
  );
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
type HoursRow = { days: number[]; open: string; close: string };

function PlaceDialog({
  place,
  blocks,
  onClose,
}: {
  place: CampusPlaceDTO | null;
  blocks: string[];
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: place?.name ?? '',
    kind: (place?.kind ?? 'office') as PlaceKind,
    block: place?.block ?? '',
    floor: place?.floor === null || place?.floor === undefined ? '' : String(place.floor),
    description: place?.description ?? '',
    office: (place?.office ?? '') as Office | '',
  });
  const [hours, setHours] = useState<HoursRow[]>(
    place?.hours.map((h) => ({ ...h, days: [...h.days] })) ?? [
      { days: [1, 2, 3, 4, 5], open: '08:30', close: '16:30' },
    ],
  );
  const set = (field: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));
  const setRow = (index: number, change: Partial<HoursRow>) =>
    setHours((rows) => rows.map((r, i) => (i === index ? { ...r, ...change } : r)));
  const save = useSubmit(campusPlaceSchema, (input) => api.campus.savePlace(input, place?.id), {
    done: (p) => `${p.name} saved`,
    invalidate: [keys.campusPlaces],
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.run(
      {
        ...form,
        floor: form.floor === '' ? null : Number(form.floor),
        office: form.office || null,
        description: form.description.trim() || null,
        hours,
      },
      onClose,
    );
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent wide title={place ? `Edit ${place.name}` : 'Add a place'}>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <Field label="Name" htmlFor="place-name">
              <Input id="place-name" value={form.name} onChange={set('name')} />
            </Field>
            <Field label="Kind" htmlFor="place-kind">
              <Select id="place-kind" value={form.kind} onChange={set('kind')}>
                <option value="office">Office</option>
                <option value="facility">Facility</option>
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_120px_1fr]">
            <Field label="Building" htmlFor="place-block">
              <Input
                id="place-block"
                list="place-blocks"
                value={form.block}
                onChange={set('block')}
              />
              <datalist id="place-blocks">
                {blocks.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </Field>
            <Field label="Floor" htmlFor="place-floor" hint="0 = ground">
              <Input id="place-floor" type="number" value={form.floor} onChange={set('floor')} />
            </Field>
            <Field label="Office it houses" htmlFor="place-office">
              <Select id="place-office" value={form.office} onChange={set('office')}>
                <option value="">None</option>
                {OFFICES.map((o) => (
                  <option key={o} value={o}>
                    {OFFICE_LABELS[o]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="What's there (optional)" htmlFor="place-description">
            <Textarea
              id="place-description"
              rows={2}
              value={form.description}
              onChange={set('description')}
            />
          </Field>
          <fieldset className="rounded-lg border">
            <legend className="sr-only">Opening hours</legend>
            <p className="border-b px-3 py-2 text-[13px] font-semibold">Opening hours</p>
            <ul className="divide-y">
              {hours.map((row, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: rows are edited in place
                <li key={index} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <div className="flex w-full flex-wrap gap-x-3 gap-y-1">
                    {DAYS.map((d, i) => (
                      <Checkbox
                        key={d}
                        label={d}
                        checked={row.days.includes(i + 1)}
                        onChange={(e) =>
                          setRow(index, {
                            days: e.target.checked
                              ? [...row.days, i + 1].sort()
                              : row.days.filter((x) => x !== i + 1),
                          })
                        }
                      />
                    ))}
                  </div>
                  <Input
                    aria-label={`Opens (row ${index + 1})`}
                    type="time"
                    value={row.open}
                    onChange={(e) => setRow(index, { open: e.target.value })}
                    className="h-8 w-32"
                  />
                  <span className="text-muted-foreground">to</span>
                  <Input
                    aria-label={`Closes (row ${index + 1})`}
                    type="time"
                    value={row.close}
                    onChange={(e) => setRow(index, { close: e.target.value })}
                    className="h-8 w-32"
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove hours row ${index + 1}`}
                    onClick={() => setHours((rows) => rows.filter((_, i) => i !== index))}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
            <div className="border-t px-3 py-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={hours.length >= 4}
                onClick={() =>
                  setHours((rows) => [...rows, { days: [6], open: '09:00', close: '13:00' }])
                }
              >
                <Plus /> Add hours
              </Button>
            </div>
          </fieldset>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.pending}>
              {place ? 'Save changes' : 'Add place'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Every building: its offices and facilities (open or closed now) and its rooms (free or busy now). */
export default function MapPage() {
  const places = useQuery({
    queryKey: keys.campusPlaces,
    queryFn: api.campus.places,
    refetchInterval: 60_000,
  });
  const rooms = useQuery({
    queryKey: ['academics', 'rooms', 'finder', 'now'],
    queryFn: () => api.academics.roomFinder({}),
    refetchInterval: 60_000,
  });
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<CampusPlaceDTO | 'new' | null>(null);
  const remove = useAction((p: CampusPlaceDTO) => api.campus.deletePlace(p.id), {
    done: 'Place removed',
    invalidate: [keys.campusPlaces],
  });
  const needle = q.trim().toLowerCase();
  const matches = (text: string | null) => !needle || (text ?? '').toLowerCase().includes(needle);

  const byBlock = new Map<string, Block>();
  const blockOf = (name: string) => {
    const existing = byBlock.get(name);
    if (existing) return existing;
    const created: Block = { name, places: [], rooms: [] };
    byBlock.set(name, created);
    return created;
  };
  for (const p of places.data?.places ?? []) blockOf(p.block).places.push(p);
  for (const r of rooms.data?.rooms ?? []) blockOf(r.room.block).rooms.push(r);
  const allBlocks = [...byBlock.values()].sort((a, b) => a.name.localeCompare(b.name));
  const blocks = allBlocks
    .map((b) => ({
      ...b,
      places: b.places.filter((p) => matches(p.name) || matches(p.description) || matches(b.name)),
      rooms: b.rooms.filter((r) => matches(r.room.name) || matches(b.name)),
    }))
    .filter((b) => b.places.length || b.rooms.length);
  const canManage = places.data?.canManage ?? false;

  return (
    <>
      <PageHeader
        title="Campus map"
        description="Every building with its offices, facilities and rooms, and what's open or free right now."
        actions={
          canManage && (
            <Button onClick={() => setEditing('new')}>
              <Plus /> Add a place
            </Button>
          )
        }
      />
      <div className="relative mb-5 max-w-md">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          aria-label="Find a place"
          placeholder="Room, office or facility"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-8"
        />
      </div>
      {!places.data || !rooms.data ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !blocks.length ? (
        <EmptyState icon={MapPin} title="Nothing found" className="rounded-lg border bg-surface">
          Try a room name like A-101, or an office like Accounts.
        </EmptyState>
      ) : (
        <>
          <nav
            aria-label="Buildings"
            className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
          >
            {blocks.map((b) => {
              const free = b.rooms.filter((r) => !r.current).length;
              return (
                <a
                  key={b.name}
                  href={`#${slug(b.name)}`}
                  className="rounded-lg border bg-surface px-3 py-2.5 hover:bg-surface-2"
                >
                  <span className="flex items-center gap-1.5 text-[13.5px] font-bold">
                    <Building2
                      className="size-4 shrink-0 text-primary dark:text-link"
                      aria-hidden
                    />
                    {b.name}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-muted-foreground">
                    {[
                      b.rooms.length ? `${free} of ${b.rooms.length} rooms free` : null,
                      b.places.length
                        ? `${b.places.length} place${b.places.length === 1 ? '' : 's'}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </a>
              );
            })}
          </nav>
          <div className="space-y-5">
            {blocks.map((b) => {
              const floors = [...new Set(b.rooms.map((r) => r.room.floor))].sort(
                (x, y) => (x ?? -9) - (y ?? -9),
              );
              return (
                <section key={b.name} id={slug(b.name)} className="scroll-mt-4">
                  <Card title={b.name}>
                    {b.places.length > 0 && (
                      <ul className="divide-y">
                        {b.places.map((p) => (
                          <li key={p.id} className="flex items-start gap-3 px-4 py-3">
                            <MapPin
                              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1 text-[13px]">
                              <p className="flex flex-wrap items-center gap-2">
                                <span className="text-[14px] font-semibold">{p.name}</span>
                                <OpenBadge place={p} />
                              </p>
                              <p className="text-muted-foreground">
                                {[floorName(p.floor), p.description].filter(Boolean).join(' · ')}
                              </p>
                              {p.hours.length > 0 && <p>{describeHours(p.hours)}</p>}
                            </div>
                            {canManage && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Actions for ${p.name}`}
                                  >
                                    <Ellipsis />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                  <DropdownMenuItem onSelect={() => setEditing(p)}>
                                    <Pencil /> Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem danger onSelect={() => remove.mutate(p)}>
                                    <Trash2 /> Remove
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {floors.map((floor) => (
                      <div key={floor ?? 'none'} className="border-t first:border-t-0">
                        <p className="bg-surface-2 px-4 py-1.5 text-[12px] font-semibold text-muted-foreground">
                          {floorName(floor) ?? 'Rooms'}
                        </p>
                        <ul className="grid gap-px bg-border sm:grid-cols-2">
                          {b.rooms
                            .filter((r) => r.room.floor === floor)
                            .map((r) => {
                              const status = roomStatus(r);
                              return (
                                <li
                                  key={r.room.id}
                                  className="flex items-start gap-3 bg-surface px-4 py-2.5"
                                >
                                  <DoorOpen
                                    className={cn(
                                      'mt-0.5 size-4 shrink-0',
                                      status.busy ? 'text-warning' : 'text-success',
                                    )}
                                    aria-hidden
                                  />
                                  <div className="min-w-0 text-[13px]">
                                    <p>
                                      <span className="font-semibold">{r.room.name}</span>{' '}
                                      <span className="text-muted-foreground">
                                        · {ROOM_KIND_LABELS[r.room.kind]}, {r.room.capacity} seats
                                      </span>
                                    </p>
                                    <p className={status.busy ? 'text-warning' : 'text-success'}>
                                      {status.text}
                                    </p>
                                  </div>
                                </li>
                              );
                            })}
                          {/* Keeps the two-column grid even (no grey gap after an odd room). */}
                          {b.rooms.filter((r) => r.room.floor === floor).length % 2 === 1 && (
                            <li aria-hidden className="hidden bg-surface sm:block" />
                          )}
                        </ul>
                      </div>
                    ))}
                  </Card>
                </section>
              );
            })}
          </div>
        </>
      )}
      {editing && (
        <PlaceDialog
          place={editing === 'new' ? null : editing}
          blocks={allBlocks.map((b) => b.name)}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
