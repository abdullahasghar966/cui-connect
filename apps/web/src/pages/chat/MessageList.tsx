import {
  canDeleteMessage,
  canPin,
  canPost,
  describePostPolicy,
  type GroupDTO,
  toPolicyGroup,
  toPolicyMembership,
  toPolicyUser,
  type UserDTO,
} from '@cui/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  Check,
  CheckCheck,
  Ellipsis,
  Pin,
  PinOff,
  RefreshCw,
  Reply,
  Trash2,
  TriangleAlert,
  VenetianMask,
} from 'lucide-react';
import {
  Fragment,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Spinner } from '@/components/feedback';
import { GroupIcon } from '@/components/group-meta';
import { Avatar, RoleBadge, roleLabel } from '@/components/people';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
} from '@/components/ui/menu';
import { useCurrentUser, useMessages } from '@/hooks/queries';
import { useDeleteMessage, useMarkRead, usePin, useSendMessage } from '@/hooks/useChatActions';
import { type ClientMessage, removeMessage } from '@/lib/cache';
import { cn, formatDayLabel, formatTime, isSameDay } from '@/lib/utils';
import { useUi } from '@/state/ui';
import { MessageText, ReactionPicker, Reactions, ReplyQuote } from './message-extras';
import { PollCard } from './PollCard';

const GROUP_WINDOW_MS = 5 * 60 * 1000;
const shortTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

interface RowProps {
  message: ClientMessage;
  group: GroupDTO;
  me: UserDTO;
  grouped: boolean;
  seen: boolean | null;
  /** Briefly marked after jumping here from search. */
  highlight?: boolean;
}

function useMessageControls(message: ClientMessage, group: GroupDTO, me: UserDTO) {
  const qc = useQueryClient();
  const deleteMessage = useDeleteMessage();
  const send = useSendMessage();
  const pin = usePin();
  const setReplyTo = useUi((s) => s.setReplyTo);
  const user = toPolicyUser(me);
  const policyGroup = toPolicyGroup(group);
  const membership = toPolicyMembership(group);
  const settled = !message.deleted && !message.status;
  const canDelete =
    settled &&
    canDeleteMessage(user, policyGroup, membership, {
      senderId: message.sender.id,
      createdAt: message.createdAt,
    }).allowed;
  return {
    canDelete,
    canReply: settled && canPost(user, policyGroup, membership).allowed,
    canPin: settled && canPin(user, policyGroup, membership).allowed,
    canReact: settled,
    remove: () => void deleteMessage(message.id),
    reply: () => {
      setReplyTo(group.id, message);
      document.querySelector<HTMLTextAreaElement>('[data-composer]')?.focus();
    },
    togglePin: () => void pin(group.id, message.id, !message.pinned),
    retry: () =>
      void send(group.id, message.body, {
        clientId: message.clientId ?? undefined,
        poll: message.poll
          ? {
              question: message.poll.question,
              options: message.poll.options.map((o) => o.text),
              multiple: message.poll.multiple,
            }
          : undefined,
        replyTo: message.replyTo,
        mentions: message.mentions,
        anonymous: message.anonymous,
      }),
    discard: () => removeMessage(qc, group.id, (m) => m.id === message.id),
  };
}

const TOOL =
  'flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground';

/** Who wrote it. An anonymous question shows a mask to everyone but its author. */
function SenderName({ message, me }: { message: ClientMessage; me: UserDTO }) {
  if (message.anonymous && message.sender.id !== me.id) {
    return (
      <span className="flex items-center gap-1 text-[15px] font-bold">
        <VenetianMask className="size-4 text-muted-foreground" aria-hidden />
        {message.sender.name}
      </span>
    );
  }
  return (
    <>
      <span className="text-[15px] font-bold">{message.sender.name}</span>
      {message.anonymous ? (
        <span className="inline-flex items-center gap-1 rounded-[4px] border border-border px-1.5 text-[11px] leading-[18px] font-semibold text-muted-foreground">
          <VenetianMask className="size-3" aria-hidden /> Anonymous to others
        </span>
      ) : (
        <RoleBadge person={message.sender} />
      )}
    </>
  );
}

function MessageRow({ message, group, me, grouped, seen, highlight }: RowProps) {
  const controls = useMessageControls(message, group, me);
  const [, setParams] = useSearchParams();
  const created = new Date(message.createdAt);
  const masked = message.anonymous && message.sender.id !== me.id;
  const mentionsMe = message.mentions.some((m) => m.id === me.id);
  const hasTools = controls.canReact || controls.canReply || controls.canPin || controls.canDelete;

  return (
    <div
      id={`message-${message.id}`}
      className={cn(
        'group/message relative flex gap-2.5 px-5 transition-colors duration-700 hover:bg-surface-2 has-[[data-state=open]]:bg-surface-2',
        grouped ? 'py-0.5' : 'mt-1.5 pt-1.5 pb-0.5',
        message.status === 'sending' && 'opacity-60',
        mentionsMe && 'border-l-2 border-warning bg-warning-soft/40 pl-[18px]',
        highlight && 'bg-warning-soft hover:bg-warning-soft',
      )}
    >
      <div className="w-9 shrink-0">
        {grouped ? (
          <time
            dateTime={message.createdAt}
            className="invisible block pt-[3px] text-right text-[10.5px] leading-5 text-muted-foreground group-hover/message:visible"
          >
            {shortTime.format(created)}
          </time>
        ) : masked ? (
          <span
            aria-hidden
            className="mt-0.5 flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground"
          >
            <VenetianMask className="size-5" />
          </span>
        ) : (
          <Avatar name={message.sender.name} className="mt-0.5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <SenderName message={message} me={me} />
            <Tooltip content={created.toLocaleString()}>
              <time dateTime={message.createdAt} className="text-[12px] text-muted-foreground">
                {formatTime(message.createdAt)}
              </time>
            </Tooltip>
          </div>
        )}
        {message.pinned && (
          <p className="flex items-center gap-1 text-[12px] text-muted-foreground">
            <Pin className="size-3" aria-hidden /> Pinned by {message.pinned.byName}
          </p>
        )}
        {message.replyTo && (
          <ReplyQuote
            reply={message.replyTo}
            onJump={() => setParams({ message: message.replyTo?.id ?? '' }, { replace: true })}
          />
        )}
        <div
          className={cn(
            'text-[15px] leading-[1.46] break-words whitespace-pre-wrap',
            message.deleted && 'text-muted-foreground italic',
          )}
        >
          {message.deleted ? (
            'This message was deleted.'
          ) : message.kind === 'poll' && message.poll ? null : (
            <MessageText message={message} me={me} />
          )}
        </div>
        {!message.deleted && message.kind === 'poll' && message.poll && (
          <PollCard message={message} poll={message.poll} group={group} me={me} />
        )}
        {!message.deleted && <Reactions message={message} group={group} me={me} />}
        {message.status === 'failed' && (
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[12.5px] text-danger">
            <TriangleAlert className="size-3.5" aria-hidden />
            Not sent: {message.error}
            <button
              type="button"
              className="inline-flex items-center gap-1 font-semibold hover:underline"
              onClick={controls.retry}
            >
              <RefreshCw className="size-3" aria-hidden /> Retry
            </button>
            <button
              type="button"
              className="font-semibold hover:underline"
              onClick={controls.discard}
            >
              Discard
            </button>
          </p>
        )}
        {seen !== null && (
          <p className="mt-0.5 flex items-center gap-1 text-[12px] text-muted-foreground">
            {seen ? (
              <>
                <CheckCheck className="size-3.5 text-primary dark:text-link" aria-hidden /> Seen
              </>
            ) : (
              <>
                <Check className="size-3.5" aria-hidden /> Delivered
              </>
            )}
          </p>
        )}
      </div>
      {hasTools && (
        <div className="absolute -top-3.5 right-5 hidden rounded-lg border bg-surface p-0.5 shadow-sm group-focus-within/message:flex group-hover/message:flex pointer-coarse:flex has-[[data-state=open]]:flex">
          {controls.canReact && <ReactionPicker message={message} group={group} className={TOOL} />}
          {controls.canReply && (
            <Tooltip content="Reply">
              <button type="button" aria-label="Reply" className={TOOL} onClick={controls.reply}>
                <Reply className="size-4" />
              </button>
            </Tooltip>
          )}
          {controls.canPin && (
            <Tooltip content={message.pinned ? 'Unpin' : 'Pin to this chat'}>
              <button
                type="button"
                aria-label={message.pinned ? 'Unpin message' : 'Pin message'}
                className={TOOL}
                onClick={controls.togglePin}
              >
                {message.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
              </button>
            </Tooltip>
          )}
          {controls.canDelete && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Message options" className={TOOL}>
                  <Ellipsis className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem danger onSelect={controls.remove}>
                  <Trash2 /> Delete message
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </div>
  );
}

function DayDivider({ iso }: { iso: string }) {
  return (
    <div className="relative my-3 flex items-center justify-center px-5">
      <div className="absolute inset-x-5 top-1/2 h-px bg-border" aria-hidden />
      <span className="relative rounded-full border bg-surface px-3 py-0.5 text-[12.5px] font-semibold">
        {formatDayLabel(iso)}
      </span>
    </div>
  );
}

function NewDivider() {
  return (
    <div className="my-1 flex items-center gap-2 px-5">
      <div className="h-px flex-1 bg-new" aria-hidden />
      <span className="text-[11.5px] font-bold text-new">New</span>
    </div>
  );
}

/** Shown once the very first message has loaded, like the top of a channel. */
function ConversationIntro({ group }: { group: GroupDTO }) {
  if (group.type === 'DIRECT' && group.peer) {
    return (
      <div className="px-5 pt-8 pb-4">
        <Avatar name={group.peer.name} size="xl" />
        <h2 className="mt-3 text-[22px] font-bold">{group.peer.name}</h2>
        <p className="mt-0.5 text-[14px] text-muted-foreground">
          {[roleLabel(group.peer), group.peer.designation ?? group.peer.regNo]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <p className="mt-3 text-[15px] text-muted-foreground">
          This is the beginning of your conversation with{' '}
          <span className="font-semibold text-foreground">{group.peer.name}</span>.
        </p>
      </div>
    );
  }
  return (
    <div className="px-5 pt-8 pb-4">
      <span className="flex size-14 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <GroupIcon type={group.type} settings={group.settings} className="size-7" />
      </span>
      <h2 className="mt-3 text-[22px] font-bold">{group.name}</h2>
      <p className="mt-1 text-[15px] text-muted-foreground">
        This is the beginning of {group.name}.{group.description ? ` ${group.description}` : ''}
      </p>
      <p className="mt-1 text-[13.5px] text-muted-foreground">
        {describePostPolicy(group)} · {group.memberCount} members
      </p>
    </div>
  );
}

export function MessageList({ group }: { group: GroupDTO }) {
  const me = useCurrentUser();
  const markRead = useMarkRead();
  const { data, isPending, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useMessages(group.id);
  const scrollRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const restore = useRef<{ height: number; top: number } | null>(null);
  // Where the "New" line goes: the read marker as it was when the conversation was opened.
  const [readMarker] = useState(() => (group.unread > 0 ? (group.lastReadMessageId ?? '') : null));

  const messages = useMemo<ClientMessage[]>(
    () => (data ? [...data.pages].reverse().flatMap((p) => p.messages) : []),
    [data],
  );
  const last = messages.at(-1);

  // Keep the view pinned to the newest message, or anchored when older pages load above.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run whenever messages are added
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (restore.current) {
      el.scrollTop = el.scrollHeight - restore.current.height + restore.current.top;
      restore.current = null;
      return;
    }
    if (atBottom.current || last?.sender.id === me.id) el.scrollTop = el.scrollHeight;
  }, [messages.length, last?.id, last?.sender.id, me.id]);

  // Infinite scroll upwards.
  useEffect(() => {
    const el = scrollRef.current;
    const sentinel = topRef.current;
    if (!el || !sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          restore.current = { height: el.scrollHeight, top: el.scrollTop };
          void fetchNextPage();
        }
      },
      { root: el, rootMargin: '200px 0px 0px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Jump to a message from search: load older pages until it's there, then show it.
  const [params, setParams] = useSearchParams();
  const target = params.get('message');
  const [flash, setFlash] = useState<string | null>(null);
  const tries = useRef(0);
  useEffect(() => {
    if (!target || isPending) return;
    const clear = () => {
      const next = new URLSearchParams(params);
      next.delete('message');
      setParams(next, { replace: true });
    };
    if (messages.some((m) => m.id === target)) {
      atBottom.current = false;
      document.getElementById(`message-${target}`)?.scrollIntoView({ block: 'center' });
      setFlash(target);
      window.setTimeout(() => setFlash(null), 2500);
      clear();
    } else if (hasNextPage && tries.current < 30) {
      if (isFetchingNextPage) return;
      tries.current++;
      void fetchNextPage();
    } else {
      toast('That message is no longer in this chat.');
      clear();
    }
  }, [
    target,
    isPending,
    messages,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    params,
    setParams,
  ]);

  // Read receipts: mark the newest confirmed message as read while the tab is visible.
  const lastConfirmed = useMemo(() => [...messages].reverse().find((m) => !m.status), [messages]);
  useEffect(() => {
    const target = lastConfirmed?.id;
    if (!target) return;
    const maybeMark = () => {
      if (document.visibilityState !== 'visible') return;
      const read = group.lastReadMessageId;
      if (!read || target > read) markRead(group.id, target);
    };
    maybeMark();
    document.addEventListener('visibilitychange', maybeMark);
    return () => document.removeEventListener('visibilitychange', maybeMark);
  }, [lastConfirmed?.id, group.id, group.lastReadMessageId, markRead]);

  // "Seen" applies to my latest confirmed message in a DM.
  const myLast = useMemo(
    () => [...messages].reverse().find((m) => m.sender.id === me.id && !m.status && !m.deleted),
    [messages, me.id],
  );
  const seenUpTo = group.peerLastReadMessageId;
  const firstNewId = useMemo(() => {
    if (readMarker === null) return null;
    return messages.find((m) => !m.status && m.sender.id !== me.id && m.id > readMarker)?.id;
  }, [messages, readMarker, me.id]);

  let content: ReactNode;
  if (isPending) {
    content = (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  } else if (isError) {
    content = (
      <div className="py-10 text-center text-[14px]">
        <p className="text-danger">Couldn’t load messages.</p>
        <button
          type="button"
          className="mt-1 font-semibold text-link hover:underline"
          onClick={() => void refetch()}
        >
          Try again
        </button>
      </div>
    );
  } else {
    content = messages.map((message, i) => {
      const prev = messages[i - 1];
      const newDay = !prev || !isSameDay(new Date(prev.createdAt), new Date(message.createdAt));
      const isFirstNew = message.id === firstNewId;
      const grouped =
        !newDay &&
        !isFirstNew &&
        !!prev &&
        !prev.anonymous &&
        !message.anonymous &&
        prev.sender.id === message.sender.id &&
        new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() <
          GROUP_WINDOW_MS;
      const seen =
        group.type === 'DIRECT' && message.id === myLast?.id
          ? !!seenUpTo && seenUpTo >= message.id
          : null;
      return (
        <Fragment key={message.clientId ?? message.id}>
          {newDay && <DayDivider iso={message.createdAt} />}
          {isFirstNew && <NewDivider />}
          <MessageRow
            message={message}
            group={group}
            me={me}
            grouped={grouped}
            seen={seen}
            highlight={message.id === flash}
          />
        </Fragment>
      );
    });
  }

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => {
        const el = e.currentTarget;
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      }}
      className="scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto pb-3"
      aria-live="polite"
      aria-relevant="additions"
    >
      <div ref={topRef} className="h-px shrink-0" />
      {isFetchingNextPage && (
        <div className="flex justify-center py-3">
          <Spinner />
        </div>
      )}
      <div className="mt-auto">
        {!isPending && !isError && !hasNextPage && <ConversationIntro group={group} />}
        {content}
      </div>
    </div>
  );
}
