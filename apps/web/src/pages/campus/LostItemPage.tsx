import { formatShortDate, ITEM_CATEGORY_LABELS, lostClaimSchema } from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CircleCheck, PackageSearch, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { EmptyState, Spinner } from '@/components/feedback';
import { Card } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/form';
import { useAction, useSubmit } from '@/hooks/useSubmit';
import { ApiError, api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { formatListTime } from '@/lib/utils';
import { KindBadge } from './LostFoundPage';

/** One report: details and photo; answering it; and for its reporter, the answers. */
export default function LostItemPage() {
  const { itemId = '' } = useParams();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: keys.lostItem(itemId),
    queryFn: () => api.campus.lostItem(itemId),
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
  });
  const [message, setMessage] = useState('');
  const refresh = [keys.lostFound];
  const answer = useSubmit(
    lostClaimSchema,
    (input) => api.campus.claimItem(itemId, input.message),
    {
      done: 'Sent to the person who reported it',
      invalidate: refresh,
    },
  );
  const resolve = useAction((claimId: string | null) => api.campus.resolveItem(itemId, claimId), {
    done: 'Marked returned',
    invalidate: refresh,
  });
  const remove = useAction(() => api.campus.deleteItem(itemId), {
    done: 'Report removed',
    invalidate: refresh,
  });
  const item = query.data;

  const back = (
    <Link
      to="/campus/lost-found"
      className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-link hover:underline"
    >
      <ArrowLeft className="size-3.5" aria-hidden /> Lost & found
    </Link>
  );
  if (query.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (!item) {
    return (
      <>
        {back}
        <EmptyState icon={PackageSearch} title="Can't open this report">
          {query.error instanceof ApiError ? query.error.message : 'Try again in a moment.'}
        </EmptyState>
      </>
    );
  }
  const send = (e: FormEvent) => {
    e.preventDefault();
    answer.run({ message }, () => setMessage(''));
  };
  return (
    <>
      {back}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          {item.photo && (
            <img
              src={item.photo.url}
              alt={item.title}
              className="max-h-96 w-full bg-surface-2 object-contain"
            />
          )}
          <div className="space-y-2 px-5 py-4">
            <p className="flex flex-wrap gap-1.5">
              <KindBadge kind={item.kind} />
              <Badge tone="neutral">{ITEM_CATEGORY_LABELS[item.category]}</Badge>
              {item.resolved && <Badge tone="outline">Returned</Badge>}
            </p>
            <h1 className="text-[22px] leading-tight font-bold">{item.title}</h1>
            <p className="text-[13.5px] text-muted-foreground">
              {item.kind === 'lost' ? 'Lost' : 'Found'} at {item.place} on{' '}
              {formatShortDate(item.date)} · reported by {item.reporter.name}
            </p>
            {item.description && (
              <p className="text-[14px] whitespace-pre-line">{item.description}</p>
            )}
            {item.kind === 'found' && !item.resolved && (
              <p className="rounded-md bg-surface-2 px-3 py-2 text-[13px]">
                Found items are kept at Student Affairs (Student Service Centre, ground floor).
              </p>
            )}
          </div>
        </Card>

        <div className="space-y-5">
          {item.resolved ? (
            <p className="flex items-start gap-2 rounded-lg border border-success/25 bg-primary-soft px-3 py-2.5 text-[13.5px] text-success">
              <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              Returned{item.resolvedAt ? ` ${formatListTime(item.resolvedAt)}` : ''}.
            </p>
          ) : (
            !item.mine &&
            (item.myClaim ? (
              <Card title="Your answer">
                <p className="px-4 py-3 text-[13.5px]">{item.myClaim.message}</p>
                <p className="border-t px-4 py-2 text-[12.5px] text-muted-foreground">
                  {item.reporter.name} has it and will be in touch through Student Affairs.
                </p>
              </Card>
            ) : (
              <Card title={item.kind === 'found' ? 'Is this yours?' : 'Have you found it?'}>
                <form onSubmit={send} className="space-y-3 px-4 py-3">
                  <Field
                    label={
                      item.kind === 'found'
                        ? 'How can you show it is yours?'
                        : 'Where did you find it?'
                    }
                    htmlFor="claim-message"
                    hint={item.kind === 'found' ? 'A detail only the owner would know.' : undefined}
                  >
                    <Textarea
                      id="claim-message"
                      rows={3}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                  </Field>
                  <Button type="submit" loading={answer.pending} className="w-full">
                    {item.kind === 'found' ? 'This is mine' : 'I found it'}
                  </Button>
                </form>
              </Card>
            ))
          )}

          {item.claims && (
            <Card title={`Answers (${item.claims.length})`}>
              {!item.claims.length ? (
                <p className="px-4 py-3 text-[13px] text-muted-foreground">
                  No answers yet. You are told when someone answers.
                </p>
              ) : (
                <ul className="divide-y">
                  {item.claims.map((c) => (
                    <li key={c.id} className="space-y-1.5 px-4 py-3 text-[13px]">
                      <p>
                        <span className="font-semibold">{c.user.name}</span>
                        {c.user.detail && (
                          <span className="text-muted-foreground"> · {c.user.detail}</span>
                        )}
                        {c.accepted && (
                          <Badge tone="success" className="ml-1.5">
                            Returned to them
                          </Badge>
                        )}
                      </p>
                      <p>{c.message}</p>
                      {!item.resolved && (
                        <Button
                          size="sm"
                          variant="outline"
                          loading={resolve.isPending}
                          onClick={() => resolve.mutate(c.id)}
                        >
                          {item.kind === 'found'
                            ? `Returned to ${c.user.name}`
                            : `${c.user.name} brought it back`}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {item.canResolve && !item.resolved && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                loading={resolve.isPending}
                onClick={() => resolve.mutate(null)}
              >
                <CircleCheck /> Mark as returned
              </Button>
              <Button
                variant="ghost"
                loading={remove.isPending}
                onClick={() =>
                  remove.mutate(undefined, { onSuccess: () => navigate('/campus/lost-found') })
                }
              >
                <Trash2 /> Remove report
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
