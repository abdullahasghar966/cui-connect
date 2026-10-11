import {
  canModerate,
  type GroupDTO,
  type PollDTO,
  toPolicyGroup,
  toPolicyMembership,
  toPolicyUser,
  type UserDTO,
} from '@cui/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ChartNoAxesColumn, Check, Lock } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { type ClientMessage, patchMessage } from '@/lib/cache';
import { ACK_TIMEOUT_MS, getSocket, withAck } from '@/lib/socket';
import { cn } from '@/lib/utils';

/** The poll with this person's choice swapped in, so the bar moves before the server answers. */
function withChoice(poll: PollDTO, me: string, optionIds: string[]): PollDTO {
  const options = poll.options.map((o) => ({
    ...o,
    voterIds: [...o.voterIds.filter((id) => id !== me), ...(optionIds.includes(o.id) ? [me] : [])],
  }));
  const voters = new Set(options.flatMap((o) => o.voterIds)).size;
  return { ...poll, options, voters };
}

/** A poll in a chat: anyone who can read the chat votes; the author or a moderator closes it. */
export function PollCard({
  message,
  poll,
  group,
  me,
}: {
  message: ClientMessage;
  poll: PollDTO;
  group: GroupDTO;
  me: UserDTO;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const mine = poll.options.filter((o) => o.voterIds.includes(me.id)).map((o) => o.id);
  const closed = !!poll.closedAt;
  const pending = !!message.status;
  const canClose =
    !closed &&
    !pending &&
    (message.sender.id === me.id ||
      canModerate(toPolicyUser(me), toPolicyGroup(group), toPolicyMembership(group)).allowed);
  const top = Math.max(0, ...poll.options.map((o) => o.voterIds.length));

  const choose = async (optionId: string) => {
    if (closed || pending || busy) return;
    const next = poll.multiple
      ? mine.includes(optionId)
        ? mine.filter((id) => id !== optionId)
        : [...mine, optionId]
      : mine.includes(optionId)
        ? []
        : [optionId];
    const before = poll;
    patchMessage(qc, group.id, (m) => m.id === message.id, { poll: withChoice(poll, me.id, next) });
    setBusy(true);
    const res = await withAck(
      getSocket()
        .timeout(ACK_TIMEOUT_MS)
        .emitWithAck('poll:vote', { messageId: message.id, optionIds: next }),
    );
    setBusy(false);
    if (res.ok) patchMessage(qc, group.id, (m) => m.id === message.id, { poll: res.data });
    else {
      patchMessage(qc, group.id, (m) => m.id === message.id, { poll: before });
      toast.error(res.message);
    }
  };

  const close = async () => {
    const res = await withAck(
      getSocket().timeout(ACK_TIMEOUT_MS).emitWithAck('poll:close', { messageId: message.id }),
    );
    if (res.ok) patchMessage(qc, group.id, (m) => m.id === message.id, { poll: res.data });
    else toast.error(res.message);
  };

  return (
    <section
      aria-label={`Poll: ${poll.question}`}
      className="mt-1 max-w-md rounded-lg border bg-surface p-3 whitespace-normal"
    >
      <p className="flex items-center gap-1.5 text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">
        <ChartNoAxesColumn className="size-3.5" aria-hidden />
        Poll
        {poll.multiple && <span className="normal-case">· choose any</span>}
        {closed && (
          <span className="inline-flex items-center gap-1 normal-case">
            · <Lock className="size-3" aria-hidden /> Closed
          </span>
        )}
      </p>
      <p className="mt-1 text-[15px] font-bold">{poll.question}</p>
      <ul className="mt-2 space-y-1.5">
        {poll.options.map((option) => {
          const votes = option.voterIds.length;
          const share = poll.voters ? Math.round((votes / poll.voters) * 100) : 0;
          const chosen = mine.includes(option.id);
          const leading = closed && votes > 0 && votes === top;
          return (
            <li key={option.id}>
              <button
                type="button"
                disabled={closed || pending}
                aria-pressed={chosen}
                aria-label={`${option.text}: ${votes} vote${votes === 1 ? '' : 's'}${chosen ? ', your choice' : ''}`}
                onClick={() => void choose(option.id)}
                className={cn(
                  'relative flex w-full items-center gap-2 overflow-hidden rounded-md border px-2.5 py-1.5 text-left text-[14px] transition-colors',
                  chosen ? 'border-primary' : 'border-border-strong hover:bg-surface-2',
                  'disabled:cursor-default',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-y-0 left-0 transition-[width] duration-300',
                    chosen ? 'bg-primary-soft' : 'bg-muted',
                  )}
                  style={{ width: `${share}%` }}
                />
                <span
                  aria-hidden
                  className={cn(
                    'relative flex size-4 shrink-0 items-center justify-center border',
                    poll.multiple ? 'rounded-[4px]' : 'rounded-full',
                    chosen
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border-strong',
                  )}
                >
                  {chosen && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className={cn('relative min-w-0 flex-1', leading && 'font-bold')}>
                  {option.text}
                </span>
                <span className="relative text-[12.5px] text-muted-foreground tabular-nums">
                  {votes} · {share}%
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 flex items-center gap-2 text-[12.5px] text-muted-foreground">
        <span aria-live="polite">
          {poll.voters} vote{poll.voters === 1 ? '' : 's'}
        </span>
        {mine.length > 0 && !closed && ' · tap your choice again to take it back'}
        {canClose && (
          <button
            type="button"
            onClick={() => void close()}
            className="ml-auto font-semibold text-foreground hover:underline"
          >
            Close poll
          </button>
        )}
      </p>
    </section>
  );
}
