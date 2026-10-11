import {
  campusClock,
  formatTimeRange,
  type OfficeHourDTO,
  officeSchema,
  type TeacherDTO,
  toMinutes,
  WEEKDAY_LABELS,
  WEEKDAY_SHORT,
  WEEKDAYS,
  type Weekday,
} from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { Clock, MapPin, MessageSquare, Pencil, Plus, Search, Users, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useSearchParams } from 'react-router';
import { EmptyState, Spinner } from '@/components/feedback';
import { PageHeader } from '@/components/page';
import { Avatar } from '@/components/people';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import { useCurrentUser } from '@/hooks/queries';
import { useDebounced } from '@/hooks/useDebounced';
import { useSubmit } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { useOpenDirect } from '@/pages/chat/dialogs';

const inOfficeHours = (hours: OfficeHourDTO[]) => {
  const clock = campusClock();
  return hours.some(
    (h) =>
      h.day === clock.weekday &&
      toMinutes(h.start) <= clock.minutes &&
      clock.minutes < toMinutes(h.end),
  );
};

function OfficeDialog({ teacher, onClose }: { teacher: TeacherDTO; onClose: () => void }) {
  const [location, setLocation] = useState(teacher.officeLocation ?? '');
  const [hours, setHours] = useState<OfficeHourDTO[]>(
    teacher.officeHours.length ? teacher.officeHours : [{ day: 2, start: '14:00', end: '15:00' }],
  );
  const save = useSubmit(officeSchema, api.academics.updateOffice, {
    done: 'Office details saved',
    invalidate: [['academics', 'directory']],
  });
  const set = (i: number, patch: Partial<OfficeHourDTO>) =>
    setHours((list) => list.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.run({ officeLocation: location.trim() || null, officeHours: hours }, onClose);
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Your office"
        description="Students see where to find you and when you take questions."
      >
        <form onSubmit={submit} className="space-y-3">
          <Field label="Office location" htmlFor="office-location">
            <Input
              id="office-location"
              placeholder="e.g. Faculty Block CS, Room 214"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </Field>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-[13px] font-semibold">Office hours</legend>
            {hours.map((h, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are edited in place by position
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Select
                  aria-label={`Day ${i + 1}`}
                  className="w-36"
                  value={h.day}
                  onChange={(e) => set(i, { day: Number(e.target.value) })}
                >
                  {WEEKDAYS.map((d) => (
                    <option key={d} value={d}>
                      {WEEKDAY_LABELS[d]}
                    </option>
                  ))}
                </Select>
                <Input
                  aria-label={`From ${i + 1}`}
                  type="time"
                  className="w-32"
                  value={h.start}
                  onChange={(e) => set(i, { start: e.target.value })}
                />
                <span className="text-muted-foreground">to</span>
                <Input
                  aria-label={`Until ${i + 1}`}
                  type="time"
                  className="w-32"
                  value={h.end}
                  onChange={(e) => set(i, { end: e.target.value })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove office hours ${i + 1}`}
                  onClick={() => setHours((list) => list.filter((_, j) => j !== i))}
                >
                  <X />
                </Button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setHours((list) => [...list, { day: 4, start: '11:30', end: '12:30' }])
              }
            >
              <Plus /> Add office hours
            </Button>
          </fieldset>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.pending}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TeacherCard({
  teacher,
  mine,
  onEdit,
}: {
  teacher: TeacherDTO;
  mine: boolean;
  onEdit: () => void;
}) {
  const openDirect = useOpenDirect();
  const [opening, setOpening] = useState(false);
  const now = inOfficeHours(teacher.officeHours);
  return (
    <li
      aria-label={teacher.user.name}
      className="flex flex-col gap-3 rounded-lg border bg-surface p-4 sm:flex-row sm:items-start"
    >
      <Avatar name={teacher.user.name} size="lg" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-bold">{teacher.user.name}</span>
          {teacher.user.isHOD && <Badge tone="primary">HOD</Badge>}
          {now && <Badge tone="success">In office hours now</Badge>}
        </p>
        <p className="text-[13px] text-muted-foreground">
          {[teacher.user.designation, teacher.departmentName].filter(Boolean).join(' · ')}
        </p>
        <p className="flex items-start gap-1.5 text-[13px]">
          <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          {teacher.officeLocation ?? (
            <span className="text-muted-foreground">Office not listed</span>
          )}
        </p>
        <p className="flex items-start gap-1.5 text-[13px]">
          <Clock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          {teacher.officeHours.length ? (
            teacher.officeHours
              .map((h) => `${WEEKDAY_SHORT[h.day as Weekday]} ${formatTimeRange(h.start, h.end)}`)
              .join(' · ')
          ) : (
            <span className="text-muted-foreground">No office hours listed</span>
          )}
        </p>
        {teacher.courses.length > 0 && (
          <p className="flex flex-wrap gap-1 pt-1">
            {teacher.courses.map((c) => (
              <Badge key={`${c.code}-${c.sectionName}`} tone="outline">
                {c.code} · {c.sectionName}
              </Badge>
            ))}
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        {mine ? (
          <Button variant="outline" onClick={onEdit}>
            <Pencil /> Edit my office
          </Button>
        ) : (
          teacher.canMessage && (
            <Button
              variant="outline"
              loading={opening}
              onClick={async () => {
                setOpening(true);
                await openDirect(teacher.user.id);
                setOpening(false);
              }}
            >
              <MessageSquare /> Message
            </Button>
          )
        )}
      </div>
    </li>
  );
}

/** Every teacher on campus: office, office hours, courses, and a message button where allowed. */
export default function TeachersPage() {
  const me = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const departmentId = params.get('department') ?? '';
  const search = useDebounced(q.trim(), 250);
  const [editing, setEditing] = useState<TeacherDTO | null>(null);
  const departments = useQuery({
    queryKey: keys.departments,
    queryFn: api.academics.departments,
    staleTime: 5 * 60_000,
  });
  const list = useQuery({
    queryKey: ['academics', 'directory', search, departmentId],
    queryFn: () =>
      api.academics.teacherDirectory({ q: search, departmentId: departmentId || undefined }),
    placeholderData: (previous) => previous,
  });
  const update = (next: Record<string, string>) => {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) merged.set(key, value);
      else merged.delete(key);
    }
    setParams(merged, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Teachers"
        description="Where to find each teacher and when. The Message button appears when the campus rules let you start a conversation."
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1 sm:max-w-sm">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Search teachers"
            placeholder="Search by name or office"
            className="pl-9"
            value={q}
            onChange={(e) => update({ q: e.target.value })}
          />
        </div>
        <Select
          aria-label="Department"
          className="sm:w-60"
          value={departmentId}
          onChange={(e) => update({ department: e.target.value })}
        >
          <option value="">All departments</option>
          {(departments.data ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </div>
      {list.isPending ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !list.data?.length ? (
        <EmptyState
          icon={Users}
          title="No teachers found"
          className="rounded-lg border bg-surface"
        />
      ) : (
        <ul aria-label="Teachers" className="space-y-2">
          {list.data.map((t) => (
            <TeacherCard
              key={t.user.id}
              teacher={t}
              mine={t.user.id === me.id}
              onEdit={() => setEditing(t)}
            />
          ))}
        </ul>
      )}
      {editing && <OfficeDialog teacher={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
