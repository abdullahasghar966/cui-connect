/** Pieces shared by the registration pages: the window, checks, offers, the week and the timeline. */
import {
  describeSlots,
  formatCredits,
  formatShortDate,
  type OfferLike,
  REGISTRATION_STATUS_LABELS,
  type RegistrationDTO,
  type RegistrationIssue,
  type RegistrationMode,
  type RegistrationOfferDTO,
  type RegistrationStatus,
  type RegistrationWindowDTO,
  type StudentRecordLike,
  WEEKDAY_SHORT,
  type Weekday,
} from '@cui/shared';
import {
  CalendarClock,
  CircleAlert,
  CircleCheck,
  CircleX,
  LockKeyhole,
  TriangleAlert,
} from 'lucide-react';
import { type GridItem, WeekGrid } from '@/components/timetable/WeekGrid';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/form';
import { useAction } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { cn, courseHues, formatListTime } from '@/lib/utils';

export const toOfferLike = (o: RegistrationOfferDTO): OfferLike => ({
  id: o.id,
  code: o.code,
  title: o.title,
  sectionName: o.section.name,
  credits: o.credits,
  prerequisites: o.prerequisites,
  slots: o.slots,
  seatsLeft: o.seatsLeft,
});

const STATUS_TONE: Record<RegistrationStatus, 'neutral' | 'primary' | 'success' | 'warning'> = {
  draft: 'neutral',
  submitted: 'primary',
  approved: 'success',
  returned: 'warning',
};

export function PlanStatusBadge({ status }: { status: RegistrationStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{REGISTRATION_STATUS_LABELS[status]}</Badge>;
}

/** Whether students can change plans right now, and until when. */
export function WindowBanner({
  window,
  termName,
}: {
  window: RegistrationWindowDTO;
  termName: string;
}) {
  const dates =
    window.startsOn && window.endsOn
      ? `${formatShortDate(window.startsOn)} – ${formatShortDate(window.endsOn)}`
      : null;
  const text = window.open
    ? window.mode === 'open'
      ? `Registration for ${termName} is open (opened early by the Director's Office${dates ? `; the calendar's dates are ${dates}` : ''}).`
      : `Registration for ${termName} is open until ${window.endsOn ? formatShortDate(window.endsOn) : 'the end of the window'}.`
    : window.mode === 'closed'
      ? `Registration for ${termName} is closed for now.`
      : dates
        ? `Registration for ${termName} opens ${dates}. You can look at the offers already.`
        : `Registration for ${termName} hasn't been scheduled yet.`;
  const Icon = window.open ? CalendarClock : LockKeyhole;
  return (
    <p
      className={cn(
        'mb-5 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[13.5px]',
        window.open ? 'border-primary/25 bg-primary-soft' : 'bg-surface-2',
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 size-4 shrink-0',
          window.open ? 'text-primary' : 'text-muted-foreground',
        )}
        aria-hidden
      />
      {text}
    </p>
  );
}

const MODE_LABELS: Record<RegistrationMode, string> = {
  calendar: 'Follow the academic calendar',
  open: 'Open now',
  closed: 'Closed',
};

/** The Director's Office (and IT) open or close registration by hand. */
export function WindowControl({ window }: { window: RegistrationWindowDTO }) {
  const change = useAction((mode: RegistrationMode) => api.registration.setWindow(mode), {
    done: (w) => (w.open ? 'Registration is open' : 'Registration is closed'),
    invalidate: [keys.registration],
  });
  return (
    <Select
      aria-label="Registration window"
      value={window.mode}
      disabled={change.isPending}
      onChange={(e) => change.mutate(e.target.value as RegistrationMode)}
      className="w-auto"
    >
      {(Object.keys(MODE_LABELS) as RegistrationMode[]).map((mode) => (
        <option key={mode} value={mode}>
          Registration: {MODE_LABELS[mode]}
        </option>
      ))}
    </Select>
  );
}

/** Problems that stop a plan (red) and things the advisor should know (amber). */
export function IssueList({ issues }: { issues: RegistrationIssue[] }) {
  if (!issues.length) {
    return (
      <p className="flex items-center gap-2 text-[13px] text-success">
        <CircleCheck className="size-4 shrink-0" aria-hidden /> No problems found.
      </p>
    );
  }
  const sorted = [...issues].sort((a, b) =>
    a.level === b.level ? 0 : a.level === 'block' ? -1 : 1,
  );
  return (
    <ul className="space-y-1.5" aria-label="Checks">
      {sorted.map((issue) => {
        const Icon = issue.level === 'block' ? CircleX : TriangleAlert;
        return (
          <li
            key={`${issue.level}:${issue.message}`}
            className={cn(
              'flex items-start gap-2 text-[13px]',
              issue.level === 'block' ? 'text-danger' : 'text-warning',
            )}
          >
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="text-foreground">{issue.message}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** One line: credits, teacher and weekly times. */
export function offerSummary(offer: RegistrationOfferDTO): string {
  return [
    `${formatCredits(offer.credits, offer.labCredits)} cr`,
    offer.instructor?.name ?? 'Teacher to be announced',
    describeSlots(offer.slots),
  ].join(' · ');
}

/** Prerequisites coloured by the student's record, and the seats left. */
export function OfferFacts({
  offer,
  record,
}: {
  offer: RegistrationOfferDTO;
  record: StudentRecordLike | null;
}) {
  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {offer.prerequisites.map((code) => {
        const passed = record?.passed.includes(code);
        const taking = record?.inProgress.includes(code);
        return (
          <Badge
            key={code}
            tone={!record ? 'neutral' : passed ? 'success' : taking ? 'warning' : 'danger'}
            title={
              !record
                ? `Needs ${code}`
                : passed
                  ? `You passed ${code}`
                  : taking
                    ? `You are taking ${code} this term`
                    : `You haven't passed ${code}`
            }
          >
            Needs {code}
            {record && (passed ? ' ✓' : taking ? ' (now)' : '')}
          </Badge>
        );
      })}
      <Badge tone={offer.seatsLeft === 0 ? 'danger' : offer.seatsLeft <= 5 ? 'warning' : 'outline'}>
        {offer.seatsLeft === 0 ? 'Full' : `${offer.seatsLeft} of ${offer.capacity} seats left`}
      </Badge>
    </span>
  );
}

const COLUMNS = ([1, 2, 3, 4, 5, 6] as Weekday[]).map((day) => ({
  key: String(day),
  label: WEEKDAY_SHORT[day],
}));

/** The plan's week, so clashes and gaps are easy to see. */
export function PlanWeek({ offers }: { offers: RegistrationOfferDTO[] }) {
  const hue = courseHues(offers.map((o) => o.code));
  const items: GridItem[] = offers.flatMap((offer) =>
    offer.slots.map((slot, i) => ({
      id: `${offer.id}:${i}`,
      column: slot.day - 1,
      start: slot.start,
      end: slot.end,
      title: offer.code,
      lines: [offer.section.name],
      hue: hue(offer.code),
      label: `${offer.code} ${offer.title}, ${WEEKDAY_SHORT[slot.day as Weekday]} ${slot.start} to ${slot.end}`,
    })),
  );
  const columns = items.some((i) => i.column === 5) ? COLUMNS : COLUMNS.slice(0, 5);
  return <WeekGrid columns={columns} items={items} emptyHint="Courses you add appear here." />;
}

const EVENT_WORDS: Record<RegistrationDTO['events'][number]['kind'], string> = {
  submitted: 'sent the plan',
  withdrawn: 'took the plan back',
  approved: 'approved it',
  returned: 'returned it',
};

export function PlanTimeline({ events }: { events: RegistrationDTO['events'] }) {
  if (!events.length) {
    return <p className="text-[13px] text-muted-foreground">Not sent yet.</p>;
  }
  return (
    <ol className="space-y-3">
      {[...events].reverse().map((event) => (
        <li key={`${event.at}:${event.kind}`} className="text-[13px]">
          <p>
            <span className="font-semibold">{event.by?.name ?? 'Someone'}</span>{' '}
            {EVENT_WORDS[event.kind]} ·{' '}
            <span className="text-muted-foreground">{formatListTime(event.at)}</span>
          </p>
          {event.body && (
            <p className="mt-0.5 rounded-md bg-surface-2 px-2.5 py-1.5 text-muted-foreground">
              {event.body}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

/** A note shown above a returned or approved plan. */
export function AdvisorNote({ registration }: { registration: RegistrationDTO }) {
  const last = [...registration.events].reverse().find((e) => e.kind === registration.status);
  if (registration.status === 'returned') {
    return (
      <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-[13px]">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <span>
          <span className="font-semibold">{last?.by?.name ?? 'Your advisor'} returned it:</span>{' '}
          {last?.body ?? 'Make changes and send it again.'}
        </span>
      </p>
    );
  }
  if (registration.status === 'approved') {
    return (
      <p className="flex items-start gap-2 rounded-md bg-primary-soft px-3 py-2 text-[13px] text-success">
        <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          You're registered for {registration.term.name}.
          {last?.body ? ` ${last.by?.name ?? 'Your advisor'}: “${last.body}”` : ''}
        </span>
      </p>
    );
  }
  return null;
}
