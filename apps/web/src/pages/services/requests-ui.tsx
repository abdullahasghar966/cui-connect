/** Pieces shared by the request pages: status badges, list rows and the forms students fill in. */
import {
  addDays,
  COMPLAINT_CATEGORIES,
  COMPLAINT_CATEGORY_LABELS,
  campusClock,
  FINAL_STATUSES,
  ID_CARD_REASON_LABELS,
  ID_CARD_REASONS,
  LEAVE_MAX_DAYS,
  newRequestSchema,
  REQUEST_KIND_LABELS,
  type RequestKind,
  type RequestStatus,
  requestStatusLabel,
  type ServiceRequestDTO,
} from '@cui/shared';
import {
  ChevronRight,
  CreditCard,
  FileBadge,
  FileText,
  type LucideIcon,
  MessageSquareWarning,
  Plane,
} from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { useSubmit } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { cn, formatListTime } from '@/lib/utils';

export { handlesRequests } from '@/lib/nav';

export const KIND_ICON: Record<RequestKind, LucideIcon> = {
  leave: Plane,
  transcript: FileText,
  bonafide: FileBadge,
  idcard: CreditCard,
  complaint: MessageSquareWarning,
};

const TONE: Record<RequestStatus, 'neutral' | 'primary' | 'success' | 'danger' | 'outline'> = {
  submitted: 'neutral',
  in_review: 'primary',
  approved: 'success',
  completed: 'success',
  rejected: 'danger',
  withdrawn: 'outline',
};

export function StatusBadge({ request }: { request: Pick<ServiceRequestDTO, 'kind' | 'status'> }) {
  return (
    <Badge tone={TONE[request.status]}>{requestStatusLabel(request.kind, request.status)}</Badge>
  );
}

export const isOpen = (r: Pick<ServiceRequestDTO, 'status'>) => !FINAL_STATUSES.includes(r.status);

/** One request in a list; handlers also see who sent it. */
export function RequestRow({
  request,
  showStudent,
}: {
  request: ServiceRequestDTO;
  showStudent?: boolean;
}) {
  const Icon = KIND_ICON[request.kind];
  return (
    <li>
      <Link
        to={`/services/requests/${request.id}`}
        className={cn(
          'flex items-center gap-3 px-4 py-3 hover:bg-surface-2',
          !isOpen(request) && 'opacity-75',
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          {(showStudent || request.title !== REQUEST_KIND_LABELS[request.kind]) && (
            <span className="block text-[12px] font-semibold text-muted-foreground">
              {showStudent
                ? `${request.student.name}${request.student.regNo ? ` · ${request.student.regNo}` : ''}`
                : REQUEST_KIND_LABELS[request.kind]}
            </span>
          )}
          <span className="block truncate text-[14.5px] font-bold">{request.title}</span>
          <span className="text-[12.5px] text-muted-foreground">
            {showStudent ? REQUEST_KIND_LABELS[request.kind] : `To ${request.handledBy}`} · updated{' '}
            {formatListTime(request.updatedAt)}
          </span>
        </span>
        <StatusBadge request={request} />
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

type RequestKindChoice = Exclude<RequestKind, 'complaint'>;
const CHOICES: { kind: RequestKindChoice; hint: string }[] = [
  { kind: 'leave', hint: 'Miss classes for a reason (goes to your batch advisor)' },
  { kind: 'transcript', hint: 'A signed and stamped copy (Examination Office)' },
  { kind: 'bonafide', hint: 'A letter saying you study here (Examination Office)' },
  { kind: 'idcard', hint: 'A new or replacement card (Student Affairs)' },
];

/** A student's request: pick the kind, fill in its few fields, send. */
export function NewRequestDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const today = campusClock().date;
  const [kind, setKind] = useState<RequestKindChoice>('leave');
  const [form, setForm] = useState({
    from: today,
    to: addDays(today, 1),
    reason: '',
    copies: '1',
    purpose: '',
    cardReason: 'lost' as (typeof ID_CARD_REASONS)[number],
    description: '',
  });
  const set = (field: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));
  const send = useSubmit(newRequestSchema, (input) => api.services.create(input), {
    done: (r) => `Sent to ${r.handledBy}`,
    invalidate: [keys.services],
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const input =
      kind === 'leave'
        ? { kind, from: form.from, to: form.to, reason: form.reason }
        : kind === 'transcript'
          ? { kind, copies: Number(form.copies), purpose: form.purpose }
          : kind === 'bonafide'
            ? { kind, purpose: form.purpose }
            : { kind, cardReason: form.cardReason, description: form.description.trim() || null };
    send.run(input, (created) => {
      onClose();
      navigate(`/services/requests/${created.id}`);
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        wide
        title="New request"
        description="It goes straight to whoever handles it; you can follow it here."
      >
        <form onSubmit={submit} className="space-y-4">
          <div
            role="radiogroup"
            aria-label="What do you need?"
            className="grid gap-2 sm:grid-cols-2"
          >
            {CHOICES.map((choice) => {
              const Icon = KIND_ICON[choice.kind];
              const on = kind === choice.kind;
              return (
                <label
                  key={choice.kind}
                  className={cn(
                    'flex cursor-pointer gap-3 rounded-lg border p-3 text-[13px] transition-colors',
                    on ? 'border-primary bg-primary-soft' : 'hover:bg-surface-2',
                  )}
                >
                  <input
                    type="radio"
                    name="request-kind"
                    className="sr-only"
                    checked={on}
                    onChange={() => setKind(choice.kind)}
                  />
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span>
                    <span className="block text-[14px] font-bold">
                      {REQUEST_KIND_LABELS[choice.kind]}
                    </span>
                    <span className="text-muted-foreground">{choice.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>

          {kind === 'leave' && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="From" htmlFor="req-from">
                  <Input id="req-from" type="date" value={form.from} onChange={set('from')} />
                </Field>
                <Field label="To" htmlFor="req-to" hint={`At most ${LEAVE_MAX_DAYS} days`}>
                  <Input id="req-to" type="date" value={form.to} onChange={set('to')} />
                </Field>
              </div>
              <Field
                label="Reason"
                htmlFor="req-reason"
                hint="Only your batch advisor reads it. Approved leave counts as leave, not absence, in attendance."
              >
                <Textarea id="req-reason" rows={3} value={form.reason} onChange={set('reason')} />
              </Field>
            </>
          )}
          {kind === 'transcript' && (
            <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
              <Field label="Copies" htmlFor="req-copies">
                <Select id="req-copies" value={form.copies} onChange={set('copies')}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="What is it for?" htmlFor="req-purpose">
                <Input
                  id="req-purpose"
                  value={form.purpose}
                  onChange={set('purpose')}
                  placeholder="e.g. A summer internship application"
                />
              </Field>
            </div>
          )}
          {kind === 'bonafide' && (
            <Field label="What is it for?" htmlFor="req-purpose">
              <Input
                id="req-purpose"
                value={form.purpose}
                onChange={set('purpose')}
                placeholder="e.g. Opening a student bank account"
              />
            </Field>
          )}
          {kind === 'idcard' && (
            <>
              <Field label="Why do you need one?" htmlFor="req-card">
                <Select id="req-card" value={form.cardReason} onChange={set('cardReason')}>
                  {ID_CARD_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {ID_CARD_REASON_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Anything else? (optional)" htmlFor="req-card-details">
                <Textarea
                  id="req-card-details"
                  rows={2}
                  value={form.description}
                  onChange={set('description')}
                />
              </Field>
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={send.pending}>
              Send request
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A complaint to Student Affairs. */
export function NewComplaintDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    category: 'facilities' as (typeof COMPLAINT_CATEGORIES)[number],
    subject: '',
    description: '',
  });
  const set = (field: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));
  const send = useSubmit(newRequestSchema, (input) => api.services.create(input), {
    done: 'Complaint sent to Student Affairs',
    invalidate: [keys.services],
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    send.run({ kind: 'complaint', ...form }, (created) => {
      onClose();
      navigate(`/services/requests/${created.id}`);
    });
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="New complaint"
        description="Only Student Affairs sees it. They reply here, and you're told about every update."
      >
        <form onSubmit={submit} className="space-y-3">
          <Field label="About" htmlFor="cmp-category">
            <Select id="cmp-category" value={form.category} onChange={set('category')}>
              {COMPLAINT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {COMPLAINT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Subject" htmlFor="cmp-subject">
            <Input
              id="cmp-subject"
              value={form.subject}
              onChange={set('subject')}
              placeholder="e.g. Projector in A-101 is not working"
            />
          </Field>
          <Field label="What happened?" htmlFor="cmp-description">
            <Textarea
              id="cmp-description"
              rows={5}
              value={form.description}
              onChange={set('description')}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={send.pending}>
              Send complaint
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
