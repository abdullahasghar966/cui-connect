import {
  COMPLAINT_CATEGORY_LABELS,
  formatShortDate,
  ID_CARD_REASON_LABELS,
  leaveDays,
  nextStatuses,
  REQUEST_KIND_LABELS,
  type RequestEventDTO,
  type RequestStatus,
  requestStatusLabel,
  type ServiceRequestDTO,
} from '@cui/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CircleDot, MessageSquare, Send, Undo2 } from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, Spinner } from '@/components/feedback';
import { Card, PageHeader } from '@/components/page';
import { Avatar } from '@/components/people';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/form';
import { useCurrentUser } from '@/hooks/queries';
import { errorMessage } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { cn } from '@/lib/utils';
import { isOpen, KIND_ICON, StatusBadge } from './requests-ui';

const when = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Karachi',
});

/** The fields the student filled in, in plain words. */
function Details({ request }: { request: ServiceRequestDTO }) {
  const d = request.details;
  const rows: [string, ReactNode][] = [];
  if (d.from && d.to) {
    const days = leaveDays(d.from, d.to);
    rows.push([
      'Dates',
      `${formatShortDate(d.from)}${d.to !== d.from ? ` – ${formatShortDate(d.to)}` : ''} (${days} day${days === 1 ? '' : 's'})`,
    ]);
  }
  if (d.reason) rows.push(['Reason', d.reason]);
  if (d.copies) rows.push(['Copies', d.copies]);
  if (d.purpose) rows.push(['For', d.purpose]);
  if (d.cardReason) rows.push(['Reason', ID_CARD_REASON_LABELS[d.cardReason]]);
  if (d.category) rows.push(['About', COMPLAINT_CATEGORY_LABELS[d.category]]);
  if (d.description) rows.push(['Details', d.description]);
  return (
    <dl className="grid gap-x-4 gap-y-2 p-4 text-[14px] sm:grid-cols-[120px_1fr]">
      <dt className="text-muted-foreground">From</dt>
      <dd>
        {request.student.name}
        {request.student.regNo ? ` · ${request.student.regNo}` : ''}
        {request.student.sectionName ? ` · ${request.student.sectionName}` : ''}
      </dd>
      <dt className="text-muted-foreground">Sent to</dt>
      <dd>{request.handledBy}</dd>
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="whitespace-pre-wrap">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Event({ event, request }: { event: RequestEventDTO; request: ServiceRequestDTO }) {
  const who = event.by?.name ?? 'CUI Connect';
  return (
    <li className="flex gap-3">
      {event.kind === 'reply' ? (
        <Avatar name={who} size="sm" />
      ) : (
        <span className="flex size-7 shrink-0 items-center justify-center text-muted-foreground">
          <CircleDot className="size-4" aria-hidden />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[13px]">
          <b>{who}</b>{' '}
          <span className="text-muted-foreground">
            {event.kind === 'created'
              ? 'sent it'
              : event.kind === 'reply'
                ? 'replied'
                : `marked it "${requestStatusLabel(request.kind, event.status ?? 'submitted')}"`}{' '}
            · {when.format(new Date(event.at))}
          </span>
        </p>
        {event.body && (
          <p
            className={cn(
              'mt-1 rounded-md px-3 py-2 text-[14px] whitespace-pre-wrap',
              event.kind === 'reply' ? 'border bg-surface' : 'bg-surface-2',
            )}
          >
            {event.body}
          </p>
        )}
      </div>
    </li>
  );
}

/** One request: what was asked, its timeline, a reply box, and the handler's answer buttons. */
export default function RequestPage() {
  const { requestId = '' } = useParams();
  const me = useCurrentUser();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: keys.request(requestId),
    queryFn: () => api.services.request(requestId),
  });
  const [reply, setReply] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const request = query.data;

  const run = async (label: string, action: () => Promise<ServiceRequestDTO>, done: string) => {
    setBusy(label);
    try {
      qc.setQueryData(keys.request(requestId), await action());
      void qc.invalidateQueries({ queryKey: keys.services });
      toast.success(done);
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setBusy(null);
    }
  };

  if (query.isError)
    return <EmptyState icon={MessageSquare} title="This request isn't available to you" />;
  if (!request) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  const Icon = KIND_ICON[request.kind];
  const mine = request.student.id === me.id;
  const choices: RequestStatus[] = request.canHandle
    ? nextStatuses(request.kind, request.status)
    : [];
  const sendReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!reply.trim()) return;
    if (await run('reply', () => api.services.reply(request.id, reply.trim()), 'Reply sent'))
      setReply('');
  };

  return (
    <>
      <Link
        to={
          mine
            ? request.kind === 'complaint'
              ? '/services/complaints'
              : '/services/requests'
            : '/services/inbox'
        }
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-link hover:underline"
      >
        <ArrowLeft className="size-3.5" aria-hidden /> Back
      </Link>
      <PageHeader
        title={request.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Icon className="size-4" aria-hidden /> {REQUEST_KIND_LABELS[request.kind]}
            <StatusBadge request={request} />
          </span>
        }
        actions={
          mine && isOpen(request) ? (
            <Button
              variant="outline"
              loading={busy === 'withdraw'}
              onClick={() =>
                void run('withdraw', () => api.services.withdraw(request.id), 'Withdrawn')
              }
            >
              <Undo2 /> Withdraw
            </Button>
          ) : undefined
        }
      />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="min-w-0 space-y-5">
          <Card title="Details">
            <Details request={request} />
          </Card>
          <Card title="Timeline">
            <div className="space-y-4 p-4">
              <ol className="space-y-4">
                {request.events.map((event) => (
                  <Event key={`${event.at}-${event.kind}`} event={event} request={request} />
                ))}
              </ol>
              <form onSubmit={sendReply} className="space-y-2 border-t pt-4">
                <Textarea
                  aria-label="Reply"
                  rows={2}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder={
                    mine ? 'Add information or ask a question' : `Write to ${request.student.name}`
                  }
                />
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    variant="outline"
                    loading={busy === 'reply'}
                    disabled={!reply.trim()}
                  >
                    <Send /> Reply
                  </Button>
                </div>
              </form>
            </div>
          </Card>
        </div>
        {choices.length > 0 && (
          <Card title="Answer">
            <div className="space-y-3 p-4">
              <Field
                label="Note to the student (optional)"
                htmlFor="request-note"
                hint="Shown on the timeline and in the notification."
              >
                <Textarea
                  id="request-note"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                {choices.map((status) => (
                  <Button
                    key={status}
                    variant={status === 'rejected' ? 'outline' : 'primary'}
                    loading={busy === status}
                    onClick={() =>
                      void run(
                        status,
                        () =>
                          api.services.setStatus(request.id, { status, note: note.trim() || null }),
                        `Marked "${requestStatusLabel(request.kind, status)}". ${request.student.name} was told.`,
                      ).then((ok) => ok && setNote(''))
                    }
                  >
                    {status === 'rejected' && request.kind === 'complaint'
                      ? 'Close'
                      : status === 'rejected'
                        ? 'Turn down'
                        : status === 'in_review'
                          ? 'Start working on it'
                          : status === 'approved'
                            ? 'Approve'
                            : request.kind === 'complaint'
                              ? 'Mark resolved'
                              : 'Mark ready to collect'}
                  </Button>
                ))}
              </div>
              {request.kind === 'idcard' && choices.includes('completed') && (
                <p className="text-[12.5px] text-muted-foreground">
                  Marking it ready issues the student a new digital ID card: the old card's QR code
                  stops verifying at once.
                </p>
              )}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
