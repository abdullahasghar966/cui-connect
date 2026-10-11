import {
  type ClassKind,
  type ClassSlotDTO,
  type CourseDTO,
  classSlotSchema,
  formatTimeRange,
  SLOT_PRESETS,
  type SlotCheckDTO,
  toMinutes,
  WEEKDAY_LABELS,
  WEEKDAYS,
  type Weekday,
} from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarPlus, CircleAlert, OctagonX, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { EmptyState, Spinner } from '@/components/feedback';
import { Card, PageHeader } from '@/components/page';
import { type GridItem, WeekGrid } from '@/components/timetable/WeekGrid';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import { useRooms } from '@/hooks/academics';
import { useCurrentUser } from '@/hooks/queries';
import { useDebounced } from '@/hooks/useDebounced';
import { useAction, useSubmit } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { courseHues } from '@/lib/utils';
import { canEditTimetable } from './TimetablePage';

const addMinutes = (time: string, minutes: number) => {
  const total = Math.min(toMinutes(time) + minutes, 20 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

interface SlotDraft {
  offeringId: string;
  day: number;
  start: string;
  end: string;
  roomId: string;
  kind: ClassKind;
}

function SlotDialog({
  draft,
  slotId,
  offerings,
  onClose,
}: {
  draft: SlotDraft;
  slotId?: string;
  offerings: CourseDTO[];
  onClose: () => void;
}) {
  const { data: rooms } = useRooms();
  const [form, setForm] = useState(draft);
  const [check, setCheck] = useState<SlotCheckDTO | null>(null);
  const input = { ...form, roomId: form.roomId || null };
  const debounced = useDebounced(JSON.stringify(input), 300);

  useEffect(() => {
    const parsed = classSlotSchema.safeParse(JSON.parse(debounced));
    if (!parsed.success) {
      setCheck(null);
      return;
    }
    let live = true;
    api.academics
      .checkSlot(parsed.data, slotId)
      .then((result) => live && setCheck(result))
      .catch(() => live && setCheck(null));
    return () => {
      live = false;
    };
  }, [debounced, slotId]);

  const save = useSubmit(classSlotSchema, (data) => api.academics.saveSlot(data, slotId), {
    done: (r) =>
      r.warnings.length ? `Saved, with ${r.warnings.length} warning(s)` : 'Class saved',
    invalidate: [keys.timetable],
  });
  const remove = useAction(() => api.academics.deleteSlot(slotId as string), {
    done: 'Class removed',
    invalidate: [keys.timetable],
  });
  const set = (field: keyof SlotDraft) => (e: { target: { value: string } }) =>
    setForm((f) => {
      const value = field === 'day' ? Number(e.target.value) : e.target.value;
      const next = { ...f, [field]: value } as SlotDraft;
      // Keep the class length when the start moves; labs default to three hours.
      if (field === 'start')
        next.end = addMinutes(String(value), toMinutes(f.end) - toMinutes(f.start));
      if (field === 'kind') next.end = addMinutes(f.start, value === 'lab' ? 180 : 90);
      return next;
    });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.run(input, onClose);
  };
  const blocked = !!check?.blocking.length;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={slotId ? 'Edit weekly class' : 'Add a weekly class'}
        description="Rooms, teachers and the section are checked for clashes as you type."
      >
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Course" htmlFor="slot-offering" className="sm:col-span-2">
            <Select id="slot-offering" value={form.offeringId} onChange={set('offeringId')}>
              {offerings.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code} {o.title} · {o.instructor?.name ?? 'No instructor'}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Day" htmlFor="slot-day">
            <Select id="slot-day" value={String(form.day)} onChange={set('day')}>
              {WEEKDAYS.map((d) => (
                <option key={d} value={d}>
                  {WEEKDAY_LABELS[d]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Type" htmlFor="slot-kind">
            <Select id="slot-kind" value={form.kind} onChange={set('kind')}>
              <option value="lecture">Lecture</option>
              <option value="lab">Lab</option>
            </Select>
          </Field>
          <Field label="Starts" htmlFor="slot-start" hint={`Common: ${SLOT_PRESETS.join(', ')}`}>
            <Input
              id="slot-start"
              type="time"
              step={300}
              value={form.start}
              onChange={set('start')}
            />
          </Field>
          <Field label="Ends" htmlFor="slot-end">
            <Input id="slot-end" type="time" step={300} value={form.end} onChange={set('end')} />
          </Field>
          <Field label="Room" htmlFor="slot-room" className="sm:col-span-2">
            <Select id="slot-room" value={form.roomId} onChange={set('roomId')}>
              <option value="">No room yet</option>
              {rooms?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {r.block} ({r.capacity} seats)
                </option>
              ))}
            </Select>
          </Field>

          {check && (check.blocking.length > 0 || check.warnings.length > 0) && (
            <div className="space-y-1.5 sm:col-span-2" aria-live="polite">
              {check.blocking.map((m) => (
                <p
                  key={m}
                  className="flex gap-2 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger"
                >
                  <OctagonX className="mt-0.5 size-4 shrink-0" aria-hidden /> {m}
                </p>
              ))}
              {check.warnings.map((m) => (
                <p
                  key={m}
                  className="flex gap-2 rounded-md bg-warning-soft px-3 py-2 text-[13px] text-warning"
                >
                  <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {m}
                </p>
              ))}
            </div>
          )}
          {check && !check.blocking.length && !check.warnings.length && (
            <p className="text-[13px] text-success sm:col-span-2" aria-live="polite">
              No clashes.
            </p>
          )}

          <div className="flex items-center gap-2 sm:col-span-2">
            {slotId && (
              <Button
                variant="ghost"
                className="text-danger"
                loading={remove.isPending}
                onClick={() => remove.mutate(undefined, { onSuccess: onClose })}
              >
                <Trash2 /> Remove
              </Button>
            )}
            <span className="ml-auto flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" loading={save.pending} disabled={blocked}>
                Save class
              </Button>
            </span>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function hoursPerWeek(slots: ClassSlotDTO[], offeringId: string) {
  const minutes = slots
    .filter((s) => s.offeringId === offeringId)
    .reduce((sum, s) => sum + toMinutes(s.end) - toMinutes(s.start), 0);
  return Math.round((minutes / 60) * 10) / 10;
}

export default function TimetableEditorPage() {
  const me = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const sections = useQuery({ queryKey: keys.sections, queryFn: api.academics.sections });
  const mine = (sections.data ?? []).filter(
    (s) => me.role === 'admin' || s.departmentCode === me.departmentCode,
  );
  const sectionId = params.get('section') ?? mine[0]?.id;
  const slots = useQuery({
    queryKey: [...keys.timetable, 'slots', sectionId ?? ''],
    queryFn: () => api.academics.sectionSlots(sectionId as string),
    enabled: !!sectionId,
  });
  const offerings = useQuery({
    queryKey: ['academics', 'offerings', sectionId ?? ''],
    queryFn: () => api.academics.offerings(sectionId),
    enabled: !!sectionId,
  });
  const [editing, setEditing] = useState<{ draft: SlotDraft; slotId?: string } | null>(null);

  if (!canEditTimetable(me)) {
    return (
      <EmptyState icon={OctagonX} title="Only IT Services and department offices edit timetables">
        <Link to="/academics/timetable" className="text-link hover:underline">
          Back to the timetable
        </Link>
      </EmptyState>
    );
  }

  const list = slots.data ?? [];
  const courses = offerings.data ?? [];
  const hueFor = courseHues([...courses.map((c) => c.code), ...list.map((s) => s.code)]);
  const items: GridItem[] = list.map((s) => ({
    id: s.id,
    column: s.day - 1,
    start: s.start,
    end: s.end,
    title: `${s.code} ${s.title}`,
    lines: [s.room?.name ?? 'No room', s.instructor?.name ?? ''].filter(Boolean),
    hue: hueFor(s.code),
    label: `${s.code} ${s.title}, ${WEEKDAY_LABELS[s.day as Weekday]} ${formatTimeRange(s.start, s.end)}. Edit`,
    onClick: () =>
      setEditing({
        slotId: s.id,
        draft: {
          offeringId: s.offeringId,
          day: s.day,
          start: s.start,
          end: s.end,
          roomId: s.room?.id ?? '',
          kind: s.kind,
        },
      }),
  }));
  const add = (offeringId: string) =>
    setEditing({
      draft: { offeringId, day: 1, start: '08:30', end: '10:00', roomId: '', kind: 'lecture' },
    });

  return (
    <>
      <Link
        to="/academics/timetable"
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Timetable
      </Link>
      <PageHeader
        title="Timetable editor"
        description="The weekly classes of each section this term. Students and teachers see changes immediately."
        actions={
          <Select
            aria-label="Section"
            className="w-auto min-w-44"
            value={sectionId ?? ''}
            onChange={(e) => setParams({ section: e.target.value }, { replace: true })}
          >
            {mine.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.departmentCode})
              </option>
            ))}
          </Select>
        }
      />
      {!sectionId ? (
        <EmptyState icon={CalendarPlus} title="No sections yet">
          Add sections and course offerings under Admin → Structure first.
        </EmptyState>
      ) : slots.isPending || offerings.isPending ? (
        <Spinner />
      ) : (
        <div className="space-y-5">
          <Card
            title="Courses this term"
            description="Weekly hours scheduled, compared with credit hours."
          >
            {!courses.length ? (
              <p className="px-4 py-3 text-[13.5px] text-muted-foreground">
                This section has no course offerings this term.
              </p>
            ) : (
              <ul className="divide-y">
                {courses.map((c) => {
                  const hours = hoursPerWeek(list, c.id);
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                      <span
                        aria-hidden
                        className="size-3 rounded-sm"
                        style={{ background: `hsl(${hueFor(c.code)} 55% 45%)` }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="font-mono text-[12.5px] text-muted-foreground">
                          {c.code}
                        </span>{' '}
                        <span className="font-semibold">{c.title}</span>
                        <span className="block text-[12.5px] text-muted-foreground">
                          {c.instructor?.name ?? 'No instructor'} · {c.studentCount} students
                        </span>
                      </span>
                      <span className={hours ? 'text-[13px]' : 'text-[13px] text-warning'}>
                        {hours ? `${hours} h/week` : 'Not scheduled'}
                      </span>
                      <Button variant="outline" size="sm" onClick={() => add(c.id)}>
                        <CalendarPlus /> Add class
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <WeekGrid
            columns={WEEKDAYS.map((d) => ({ key: String(d), label: WEEKDAY_LABELS[d] }))}
            items={items}
            emptyHint="No classes yet. Use “Add class” next to a course."
          />
        </div>
      )}
      {editing && (
        <SlotDialog
          draft={editing.draft}
          slotId={editing.slotId}
          offerings={courses}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
