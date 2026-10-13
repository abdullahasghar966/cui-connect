import {
  type BusRouteDTO,
  busRouteSchema,
  campusClock,
  describeDays,
  formatClock,
  formatShortDate,
  nextBus,
} from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import {
  BellRing,
  Bus,
  Ellipsis,
  Megaphone,
  Pencil,
  Phone,
  Plus,
  Trash2,
  TriangleAlert,
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
import { randomId } from '@/lib/utils';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "Today at 7:20 AM", "Tomorrow at 7:20 AM" or "Mon 19 Oct at 7:20 AM". */
function when(date: string, time: string): string {
  const today = campusClock().date;
  const day =
    date === today
      ? 'Today'
      : Date.parse(date) - Date.parse(today) === 86_400_000
        ? 'Tomorrow'
        : formatShortDate(date);
  return `${day} at ${formatClock(time)}`;
}

/** The next bus at the stop someone follows a route from. */
function NextBusCard({ route }: { route: BusRouteDTO }) {
  if (!route.myStop) return null;
  const next = nextBus(route, route.myStop, campusClock());
  const campus = route.stops.at(-1);
  return (
    <li className="px-4 py-3 text-[13.5px]">
      <p className="font-semibold">
        {route.name} · {route.myStop}
      </p>
      {next ? (
        <p>
          {next.run === 'morning'
            ? `Next pick-up: ${when(next.date, next.time)}`
            : `Evening run: ${when(next.date, next.time)} (leaves campus at ${formatClock(campus?.evening ?? next.time)})`}
        </p>
      ) : (
        <p className="text-muted-foreground">This route has no runs scheduled.</p>
      )}
      {route.notice && <p className="mt-0.5 font-semibold text-warning">{route.notice}</p>}
    </li>
  );
}

/** A stop being edited; `key` keeps each row's inputs in place as rows come and go. */
type StopRow = { key: string; name: string; morning: string; evening: string };

function RouteDialog({ route, onClose }: { route: BusRouteDTO | null; onClose: () => void }) {
  const [form, setForm] = useState({
    name: route?.name ?? '',
    bus: route?.bus ?? '',
    capacity: String(route?.capacity ?? 30),
    driverName: route?.driver?.name ?? '',
    driverPhone: route?.driver?.phone ?? '',
    notes: route?.notes ?? '',
  });
  const [days, setDays] = useState<number[]>(route?.days ?? [1, 2, 3, 4, 5]);
  const [stops, setStops] = useState<StopRow[]>(
    route?.stops.map((s) => ({ ...s, key: randomId() })) ?? [
      { key: randomId(), name: '', morning: '07:00', evening: '17:30' },
      { key: randomId(), name: 'COMSATS, Park Road', morning: '07:55', evening: '16:40' },
    ],
  );
  const set = (field: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));
  const setStop = (index: number, change: Partial<StopRow>) =>
    setStops((rows) => rows.map((r, i) => (i === index ? { ...r, ...change } : r)));
  const save = useSubmit(busRouteSchema, (input) => api.campus.saveRoute(input, route?.id), {
    done: (r) => `${r.name} saved`,
    invalidate: [keys.transport],
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.run(
      {
        name: form.name,
        bus: form.bus,
        capacity: Number(form.capacity),
        days,
        stops: stops.map(({ name, morning, evening }) => ({ name, morning, evening })),
        driverName: form.driverName.trim() || null,
        driverPhone: form.driverPhone.trim() || null,
        notes: form.notes.trim() || null,
      },
      onClose,
    );
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        wide
        title={route ? `Edit ${route.name}` : 'Add a route'}
        description="List the stops from the farthest to campus. People following the route are told when times change."
      >
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_180px_100px]">
            <Field label="Route" htmlFor="route-name">
              <Input
                id="route-name"
                value={form.name}
                onChange={set('name')}
                placeholder="e.g. Route 4: Wah Cantt"
              />
            </Field>
            <Field label="Bus" htmlFor="route-bus">
              <Input
                id="route-bus"
                value={form.bus}
                onChange={set('bus')}
                placeholder="e.g. Bus 4 (coaster)"
              />
            </Field>
            <Field label="Seats" htmlFor="route-capacity">
              <Input
                id="route-capacity"
                type="number"
                min={10}
                value={form.capacity}
                onChange={set('capacity')}
              />
            </Field>
          </div>
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-semibold">Runs on</legend>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {DAYS.map((d, i) => (
                <Checkbox
                  key={d}
                  label={d}
                  checked={days.includes(i + 1)}
                  onChange={(e) =>
                    setDays((list) =>
                      e.target.checked ? [...list, i + 1].sort() : list.filter((x) => x !== i + 1),
                    )
                  }
                />
              ))}
            </div>
          </fieldset>
          <fieldset className="rounded-lg border">
            <legend className="sr-only">Stops</legend>
            <div className="grid grid-cols-[1fr_128px_128px_32px] gap-2 border-b px-3 py-2 text-[12.5px] font-semibold text-muted-foreground">
              <span>Stop (farthest first)</span>
              <span>Morning</span>
              <span>Evening</span>
              <span />
            </div>
            <ul className="divide-y">
              {stops.map((stop, index) => (
                <li
                  key={stop.key}
                  className="grid grid-cols-[1fr_128px_128px_32px] items-center gap-2 px-3 py-1.5"
                >
                  <Input
                    aria-label={`Stop ${index + 1}`}
                    value={stop.name}
                    onChange={(e) => setStop(index, { name: e.target.value })}
                    className="h-8"
                  />
                  <Input
                    aria-label={`Morning time at stop ${index + 1}`}
                    type="time"
                    value={stop.morning}
                    onChange={(e) => setStop(index, { morning: e.target.value })}
                    className="h-8"
                  />
                  <Input
                    aria-label={`Evening time at stop ${index + 1}`}
                    type="time"
                    value={stop.evening}
                    onChange={(e) => setStop(index, { evening: e.target.value })}
                    className="h-8"
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove stop ${index + 1}`}
                    disabled={stops.length <= 2}
                    onClick={() => setStops((rows) => rows.filter((_, i) => i !== index))}
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
                disabled={stops.length >= 20}
                onClick={() =>
                  setStops((rows) => [
                    ...rows.slice(0, -1),
                    { key: randomId(), name: '', morning: '07:30', evening: '17:00' },
                    ...rows.slice(-1),
                  ])
                }
              >
                <Plus /> Add a stop
              </Button>
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Driver (staff only)" htmlFor="route-driver">
              <Input id="route-driver" value={form.driverName} onChange={set('driverName')} />
            </Field>
            <Field label="Driver's phone (staff only)" htmlFor="route-phone">
              <Input id="route-phone" value={form.driverPhone} onChange={set('driverPhone')} />
            </Field>
          </div>
          <Field label="Notes (optional)" htmlFor="route-notes">
            <Textarea id="route-notes" rows={2} value={form.notes} onChange={set('notes')} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.pending}>
              {route ? 'Save changes' : 'Add route'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NoticeDialog({ route, onClose }: { route: BusRouteDTO; onClose: () => void }) {
  const [text, setText] = useState(route.notice ?? '');
  const post = useAction((value: string | null) => api.campus.setRouteNotice(route.id, value), {
    done: (r) => (r.notice ? 'Notice sent to everyone following the route' : 'Notice cleared'),
    invalidate: [keys.transport],
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={`Notice for ${route.name}`}
        description="Shown for today only. Everyone following the route is told at once."
      >
        <div className="space-y-3">
          <Field label="What's happening?" htmlFor="route-notice">
            <Input
              id="route-notice"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Running 15 minutes late"
            />
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            {route.notice && (
              <Button
                variant="outline"
                loading={post.isPending}
                onClick={() => post.mutate(null, { onSuccess: onClose })}
              >
                Clear notice
              </Button>
            )}
            <Button
              loading={post.isPending}
              onClick={() => post.mutate(text.trim(), { onSuccess: onClose })}
            >
              <Megaphone /> Send notice
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RouteCard({
  route,
  canManage,
  onEdit,
  onNotice,
}: {
  route: BusRouteDTO;
  canManage: boolean;
  onEdit: (r: BusRouteDTO) => void;
  onNotice: (r: BusRouteDTO) => void;
}) {
  const [stop, setStop] = useState(route.myStop ?? route.stops[0]?.name ?? '');
  const follow = useAction(
    (saved: boolean) => api.campus.followRoute(route.id, saved, saved ? stop || null : null),
    {
      done: (r) =>
        r.saved ? `Following ${r.name} from ${r.myStop}` : `Stopped following ${r.name}`,
      invalidate: [keys.transport],
    },
  );
  const remove = useAction(() => api.campus.deleteRoute(route.id), {
    done: 'Route removed',
    invalidate: [keys.transport],
  });
  const stopsForFollowing = route.stops.slice(0, -1);
  return (
    <Card
      title={route.name}
      description={`${route.bus} · ${route.capacity} seats · ${describeDays(route.days)}`}
      actions={
        <div className="flex items-center gap-1.5">
          {route.saved && (
            <Badge tone="success">
              <BellRing /> Following
            </Badge>
          )}
          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${route.name}`}>
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => onNotice(route)}>
                  <Megaphone /> Post a notice for today
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onEdit(route)}>
                  <Pencil /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem danger onSelect={() => remove.mutate(undefined)}>
                  <Trash2 /> Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      }
    >
      {route.notice && (
        <p className="flex items-center gap-2 border-b bg-warning-soft px-4 py-2 text-[13.5px] font-semibold text-warning">
          <TriangleAlert className="size-4 shrink-0" aria-hidden /> Today: {route.notice}
        </p>
      )}
      <table className="w-full text-[13.5px]">
        <caption className="sr-only">{route.name} stops and times</caption>
        <thead className="bg-surface-2 text-[12px] text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-1.5 text-left font-semibold">
              Stop
            </th>
            <th scope="col" className="px-4 py-1.5 text-right font-semibold">
              Morning pick-up
            </th>
            <th scope="col" className="px-4 py-1.5 text-right font-semibold">
              Evening drop-off
            </th>
          </tr>
        </thead>
        <tbody>
          {route.stops.map((s, i) => {
            const isCampus = i === route.stops.length - 1;
            return (
              <tr key={s.name} className="border-t">
                <td className="px-4 py-1.5">
                  <span className={isCampus ? 'font-semibold' : undefined}>{s.name}</span>
                  {route.myStop === s.name && (
                    <Badge tone="primary" className="ml-1.5">
                      Your stop
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-1.5 text-right tabular-nums">
                  {isCampus ? `arrives ${formatClock(s.morning)}` : formatClock(s.morning)}
                </td>
                <td className="px-4 py-1.5 text-right tabular-nums">
                  {isCampus ? `leaves ${formatClock(s.evening)}` : formatClock(s.evening)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
        <Select
          aria-label={`Your stop on ${route.name}`}
          value={stop}
          onChange={(e) => setStop(e.target.value)}
          className="w-auto"
        >
          {stopsForFollowing.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          variant={route.saved && route.myStop === stop ? 'outline' : 'primary'}
          loading={follow.isPending}
          onClick={() => follow.mutate(!(route.saved && route.myStop === stop))}
        >
          <BellRing />{' '}
          {route.saved && route.myStop === stop ? 'Stop following' : 'Follow from this stop'}
        </Button>
        {route.notes && <span className="text-[12.5px] text-muted-foreground">{route.notes}</span>}
      </div>
      {route.driver && (
        <p className="flex items-center gap-2 border-t px-4 py-2 text-[12.5px] text-muted-foreground">
          <Phone className="size-3.5" aria-hidden /> Driver: {route.driver.name ?? '—'}
          {route.driver.phone ? ` · ${route.driver.phone}` : ''} (shown to staff only)
        </p>
      )}
    </Card>
  );
}

/** University buses: stops, times, your next bus, and same-day notices. */
export default function TransportPage() {
  const query = useQuery({
    queryKey: keys.transport,
    queryFn: api.campus.transport,
    refetchInterval: 60_000,
  });
  const [editing, setEditing] = useState<BusRouteDTO | 'new' | null>(null);
  const [noticing, setNoticing] = useState<BusRouteDTO | null>(null);
  const data = query.data;
  const followed = data?.routes.filter((r) => r.saved && r.myStop) ?? [];
  return (
    <>
      <PageHeader
        title="Transport"
        description="University buses, their stops and times. Follow your route from your stop to see your next bus and hear about changes and delays."
        actions={
          data?.canManage && (
            <Button onClick={() => setEditing('new')}>
              <Plus /> Add a route
            </Button>
          )
        }
      />
      {!data ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !data.routes.length ? (
        <EmptyState icon={Bus} title="No routes yet" className="rounded-lg border bg-surface">
          Bus routes appear here once IT Services add them.
        </EmptyState>
      ) : (
        <div className="space-y-5">
          {followed.length > 0 && (
            <Card title="Your next bus">
              <ul className="divide-y">
                {followed.map((r) => (
                  <NextBusCard key={r.id} route={r} />
                ))}
              </ul>
            </Card>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-2">
            {data.routes.map((route) => (
              <RouteCard
                key={route.id}
                route={route}
                canManage={data.canManage}
                onEdit={setEditing}
                onNotice={setNoticing}
              />
            ))}
          </div>
        </div>
      )}
      {editing && (
        <RouteDialog route={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
      {noticing && <NoticeDialog route={noticing} onClose={() => setNoticing(null)} />}
    </>
  );
}
