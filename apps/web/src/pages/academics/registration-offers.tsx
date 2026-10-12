/** Next term's offers: everyone can read them; the department office and IT change them. */
import {
  describeSlots,
  formatCredits,
  type RegistrationHomeDTO,
  type RegistrationOfferDTO,
  registrationOfferSchema,
  WEEKDAY_LABELS,
  type Weekday,
} from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { Ellipsis, ListPlus, Pencil, Plus, Trash2, Users, Wand2, X } from 'lucide-react';
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
import { useCurrentUser } from '@/hooks/queries';
import { useAction, useSubmit } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { PlanStatusBadge } from './registration-ui';

type SlotRow = { day: string; start: string; end: string };

function useSectionsAndTeachers() {
  const sections = useQuery({ queryKey: keys.sections, queryFn: api.academics.sections });
  const teachers = useQuery({ queryKey: keys.teachers, queryFn: api.academics.teachers });
  return { sections: sections.data ?? [], teachers: teachers.data ?? [] };
}

/** Sections the viewer may plan for (their own department's, or all for IT). */
function useMySections() {
  const me = useCurrentUser();
  const { sections, teachers } = useSectionsAndTeachers();
  const mine =
    me.role === 'admin' ? sections : sections.filter((s) => s.departmentCode === me.departmentCode);
  return { sections: mine, teachers };
}

function OfferDialog({
  offer,
  onClose,
}: {
  offer: RegistrationOfferDTO | null;
  onClose: () => void;
}) {
  const { sections, teachers } = useMySections();
  const catalog = useQuery({
    queryKey: keys.catalog('', '', false),
    queryFn: () => api.academics.catalog(),
  });
  const [code, setCode] = useState(offer?.code ?? '');
  const [sectionId, setSectionId] = useState(offer?.section.id ?? '');
  const [instructorId, setInstructorId] = useState(offer?.instructor?.id ?? '');
  const [capacity, setCapacity] = useState(String(offer?.capacity ?? 50));
  const [slots, setSlots] = useState<SlotRow[]>(
    offer?.slots.map((s) => ({ day: String(s.day), start: s.start, end: s.end })) ?? [
      { day: '1', start: '08:30', end: '10:00' },
    ],
  );
  const section = sections.find((s) => s.id === sectionId);
  const shownTeachers = section
    ? teachers.filter((t) => t.departmentCode === section.departmentCode)
    : teachers;
  const save = useSubmit(
    registrationOfferSchema,
    (input) => api.registration.saveOffer(input, offer?.id),
    {
      done: (o) => `${o.code} offered to ${o.section.name}`,
      invalidate: [keys.registration],
    },
  );
  const setSlot = (index: number, field: keyof SlotRow, value: string) =>
    setSlots((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.run(
      {
        code,
        sectionId,
        instructorId: instructorId || null,
        capacity: Number(capacity),
        slots: slots.map((s) => ({ day: Number(s.day), start: s.start, end: s.end })),
      },
      onClose,
    );
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        wide
        title={offer ? `Edit ${offer.code} for ${offer.section.name}` : 'Offer a course'}
        description="Students of any section can register; the section is who it is planned for. Times are checked against the section's other courses and the teacher's classes."
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Course" htmlFor="offer-code">
              <Select
                id="offer-code"
                value={code}
                disabled={!!offer}
                onChange={(e) => setCode(e.target.value)}
              >
                <option value="">Choose…</option>
                {(catalog.data ?? []).map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} {c.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Section" htmlFor="offer-section">
              <Select
                id="offer-section"
                value={sectionId}
                disabled={!!offer}
                onChange={(e) => setSectionId(e.target.value)}
              >
                <option value="">Choose…</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Teacher" htmlFor="offer-teacher">
              <Select
                id="offer-teacher"
                value={instructorId}
                onChange={(e) => setInstructorId(e.target.value)}
              >
                <option value="">To be announced</option>
                {shownTeachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Seats" htmlFor="offer-capacity">
              <Input
                id="offer-capacity"
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </Field>
          </div>
          <fieldset className="rounded-lg border">
            <legend className="sr-only">Weekly meetings</legend>
            <p className="border-b px-3 py-2 text-[13px] font-semibold">Weekly meetings</p>
            <ul className="divide-y">
              {slots.map((slot, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: rows are edited in place
                <li key={index} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                  <Select
                    aria-label={`Day of meeting ${index + 1}`}
                    value={slot.day}
                    onChange={(e) => setSlot(index, 'day', e.target.value)}
                    className="h-8 w-36"
                  >
                    {([1, 2, 3, 4, 5, 6] as Weekday[]).map((d) => (
                      <option key={d} value={d}>
                        {WEEKDAY_LABELS[d]}
                      </option>
                    ))}
                  </Select>
                  <Input
                    aria-label={`Start of meeting ${index + 1}`}
                    type="time"
                    value={slot.start}
                    onChange={(e) => setSlot(index, 'start', e.target.value)}
                    className="h-8 w-32"
                  />
                  <span className="text-muted-foreground">to</span>
                  <Input
                    aria-label={`End of meeting ${index + 1}`}
                    type="time"
                    value={slot.end}
                    onChange={(e) => setSlot(index, 'end', e.target.value)}
                    className="h-8 w-32"
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove meeting ${index + 1}`}
                    onClick={() => setSlots((rows) => rows.filter((_, i) => i !== index))}
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
                disabled={slots.length >= 6}
                onClick={() =>
                  setSlots((rows) => [...rows, { day: '2', start: '08:30', end: '10:00' }])
                }
              >
                <Plus /> Add meeting
              </Button>
            </div>
          </fieldset>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.pending}>
              {offer ? 'Save changes' : 'Offer course'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Offers each section's next-semester courses from its degree plan, at clash-free times. */
function PlanDialog({ onClose }: { onClose: () => void }) {
  const { sections } = useMySections();
  const [sectionId, setSectionId] = useState('');
  const plan = useAction(() => api.registration.planOffers({ sectionId }), {
    done: (r) =>
      r.created
        ? `Offered ${r.created} course${r.created === 1 ? '' : 's'}`
        : 'Everything in the degree plans is already offered',
    invalidate: [keys.registration],
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Fill from the degree plans"
        description="Offers each section the courses of its next semester, at times that don't clash. Courses already offered are skipped. Choose teachers afterwards."
      >
        <div className="space-y-4">
          <Field label="Section" htmlFor="plan-section">
            <Select
              id="plan-section"
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
            >
              <option value="">Choose…</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.program}, intake {s.intake})
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!sectionId}
              loading={plan.isPending}
              onClick={() => plan.mutate(undefined, { onSuccess: onClose })}
            >
              <Wand2 /> Fill offers
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ClassListDialog({ offer, onClose }: { offer: RegistrationOfferDTO; onClose: () => void }) {
  const list = useQuery({
    queryKey: [...keys.registration, 'students', offer.id],
    queryFn: () => api.registration.offerStudents(offer.id),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={`${offer.code} · ${offer.section.name}: who registered`}
        description={`${offer.seatsTaken} of ${offer.capacity} seats held by sent and approved plans.`}
      >
        {!list.data ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : !list.data.length ? (
          <p className="py-6 text-center text-[13.5px] text-muted-foreground">Nobody yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {list.data.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-[13.5px]">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{s.name}</span>
                  <span className="text-[12px] text-muted-foreground">
                    {[s.regNo, s.sectionName].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <PlanStatusBadge status={s.status} />
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface OfferActionProps {
  onList: (offer: RegistrationOfferDTO) => void;
  onEdit: (offer: RegistrationOfferDTO) => void;
  onRemove: (offer: RegistrationOfferDTO) => void;
}

/** Who registered (the office, IT and the offer's teacher), edit and remove (office and IT). */
function OfferActions({
  offer,
  onList,
  onEdit,
  onRemove,
}: OfferActionProps & { offer: RegistrationOfferDTO }) {
  const me = useCurrentUser();
  const canList = offer.canManage || (!!offer.instructor && offer.instructor.id === me.id);
  if (!canList) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${offer.code} (${offer.section.name})`}
        >
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => onList(offer)}>
          <Users /> Who registered
        </DropdownMenuItem>
        {offer.canManage && (
          <DropdownMenuItem onSelect={() => onEdit(offer)}>
            <Pencil /> Edit
          </DropdownMenuItem>
        )}
        {offer.canManage && (
          <DropdownMenuItem danger onSelect={() => onRemove(offer)}>
            <Trash2 /> Remove
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Next term's offers grouped by section, with editing for the department office and IT. */
export function OffersPanel({ home }: { home: RegistrationHomeDTO }) {
  const [sectionFilter, setSectionFilter] = useState('');
  const [editing, setEditing] = useState<RegistrationOfferDTO | 'new' | null>(null);
  const [planning, setPlanning] = useState(false);
  const [listing, setListing] = useState<RegistrationOfferDTO | null>(null);
  const remove = useAction(
    (offer: RegistrationOfferDTO) => api.registration.deleteOffer(offer.id),
    {
      done: 'Offer removed',
      invalidate: [keys.registration],
    },
  );
  const sectionNames = [...new Set(home.offers.map((o) => o.section.name))].sort();
  const shown = home.offers.filter((o) => !sectionFilter || o.section.name === sectionFilter);
  const actions: OfferActionProps = {
    onList: setListing,
    onEdit: setEditing,
    onRemove: (offer) => remove.mutate(offer),
  };
  const groups = sectionNames
    .filter((name) => !sectionFilter || name === sectionFilter)
    .map((name) => ({ name, offers: shown.filter((o) => o.section.name === name) }));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          aria-label="Section"
          value={sectionFilter}
          onChange={(e) => setSectionFilter(e.target.value)}
          className="w-auto"
        >
          <option value="">All sections</option>
          {sectionNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
        {home.canManageOffers && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setPlanning(true)}>
              <ListPlus /> Fill from degree plans
            </Button>
            <Button onClick={() => setEditing('new')}>
              <Plus /> Offer a course
            </Button>
          </div>
        )}
      </div>
      {!groups.length ? (
        <EmptyState
          icon={ListPlus}
          title="Nothing offered yet"
          className="rounded-lg border bg-surface"
        >
          {home.canManageOffers
            ? `Fill ${home.term.name}'s offers from the degree plans, then choose teachers.`
            : `The department offices haven't offered courses for ${home.term.name} yet.`}
        </EmptyState>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <Card key={group.name} title={group.name}>
              {/* Phones: one row per offer instead of a wide table. */}
              <ul className="divide-y sm:hidden">
                {group.offers.map((offer) => (
                  <li key={offer.id} className="flex items-start gap-2 px-4 py-3">
                    <div className="min-w-0 flex-1 text-[13px]">
                      <p className="text-[14px]">
                        <span className="font-mono text-[12px] text-muted-foreground">
                          {offer.code}
                        </span>{' '}
                        <span className="font-semibold">{offer.title}</span>
                      </p>
                      <p className="text-muted-foreground">
                        {offer.instructor?.name ?? 'Teacher to be announced'} · {offer.seatsTaken} /{' '}
                        {offer.capacity} seats
                      </p>
                      <p className="mt-0.5">{describeSlots(offer.slots)}</p>
                    </div>
                    <OfferActions offer={offer} {...actions} />
                  </li>
                ))}
              </ul>
              <div className="hidden sm:block">
                <Table>
                  <thead>
                    <tr>
                      <th scope="col">Course</th>
                      <th scope="col">Teacher</th>
                      <th scope="col">Weekly meetings</th>
                      <th scope="col" className="text-right">
                        Seats
                      </th>
                      <th scope="col">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.offers.map((offer) => (
                      <tr key={offer.id}>
                        <td>
                          <span className="font-mono text-[12px] text-muted-foreground">
                            {offer.code}
                          </span>{' '}
                          <span className="font-semibold">{offer.title}</span>
                          <span className="block text-[12px] text-muted-foreground">
                            {formatCredits(offer.credits, offer.labCredits)} credit hours
                          </span>
                        </td>
                        <td className="whitespace-nowrap">
                          {offer.instructor?.name ?? <Badge tone="warning">To be announced</Badge>}
                        </td>
                        <td className="text-[13px]">{describeSlots(offer.slots)}</td>
                        <td className="text-right whitespace-nowrap tabular-nums">
                          {offer.seatsTaken} / {offer.capacity}
                        </td>
                        <td className="text-right">
                          <OfferActions offer={offer} {...actions} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing && (
        <OfferDialog offer={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
      {planning && <PlanDialog onClose={() => setPlanning(false)} />}
      {listing && <ClassListDialog offer={listing} onClose={() => setListing(null)} />}
    </>
  );
}
