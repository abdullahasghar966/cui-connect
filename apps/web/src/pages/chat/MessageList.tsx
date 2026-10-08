import {
  canDeleteMessage,
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
  Clock,
  Ellipsis,
  Megaphone,
  MessageSquareDashed,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { Fragment, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { EmptyState, Spinner } from '@/components/feedback';
import { Avatar, RoleBadge } from '@/components/people';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/menu';
import { useCurrentUser, useMessages } from '@/hooks/queries';
import { useDeleteMessage, useMarkRead, useSendMessage } from '@/hooks/useChatActions';
import { type ClientMessage, removeMessage } from '@/lib/cache';
import { cn, formatDayLabel, formatTime, isSameDay } from '@/lib/utils';
import { TypingIndicator } from './TypingIndicator';

const GROUP_WINDOW_MS = 5 * 60 * 1000;
const URL_PATTERN = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]])/g;

/** Renders text with http(s) links made clickable; everything else stays plain text (XSS-safe). */
function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_PATTERN);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and immutable
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:opacity-80"
          >
            {part}
          </a>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and immutable
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

function MessageActions({ onDelete }: { onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Message options"
          className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover/message:opacity-100 hover:bg-muted focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
        >
          <Ellipsis className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem danger onSelect={onDelete}>
          <Trash2 /> Delete message
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ItemProps {
  message: ClientMessage;
  group: GroupDTO;
  me: UserDTO;
  grouped: boolean;
  seen: boolean | null;
}

function Body({ message }: { message: ClientMessage }) {
  if (message.deleted) {
    return <span className="italic opacity-70">This message was deleted</span>;
  }
  return <Linkified text={message.body} />;
}

function useMessageControls(message: ClientMessage, group: GroupDTO, me: UserDTO) {
  const qc = useQueryClient();
  const deleteMessage = useDeleteMessage();
  const send = useSendMessage();
  const canDelete =
    !message.deleted &&
    !message.status &&
    canDeleteMessage(toPolicyUser(me), toPolicyGroup(group), toPolicyMembership(group), {
      senderId: message.sender.id,
      createdAt: message.createdAt,
    }).allowed;
  return {
    canDelete,
    remove: () => void deleteMessage(message.id),
    retry: () => void send(group.id, message.body, message.clientId ?? undefined),
    discard: () => removeMessage(qc, group.id, (m) => m.id === message.id),
  };
}

function FailedNotice({
  message,
  onRetry,
  onDiscard,
}: {
  message: ClientMessage;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="mt-1 flex flex-wrap items-center justify-end gap-2 text-xs text-danger">
      <TriangleAlert className="size-3.5" aria-hidden />
      <span>Not sent: {message.error}</span>
      <button
        type="button"
        className="inline-flex items-center gap-1 font-medium underline"
        onClick={onRetry}
      >
        <RefreshCw className="size-3" /> Retry
      </button>
      <button type="button" className="font-medium underline" onClick={onDiscard}>
        Discard
      </button>
    </div>
  );
}

/** Announcement channels render as a notice board rather than chat bubbles. */
function NoticeItem({ message, group, me }: ItemProps) {
  const controls = useMessageControls(message, group, me);
  return (
    <article className="group/message animate-in rounded-2xl border bg-surface p-4 shadow-xs">
      <header className="flex items-center gap-2.5">
        <Avatar name={message.sender.name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <span className="truncate">{message.sender.name}</span>
            <RoleBadge person={message.sender} />
          </p>
          <p className="text-xs text-muted-foreground">
            {message.sender.designation ?? ''} {message.sender.designation ? '·' : ''}{' '}
            {formatTime(message.createdAt)}
          </p>
        </div>
        <Megaphone className="size-4 text-amber-500" aria-hidden />
        {controls.canDelete && <MessageActions onDelete={controls.remove} />}
      </header>
      <div className="mt-3 text-[15px] leading-relaxed break-words whitespace-pre-wrap">
        <Body message={message} />
      </div>
      {message.status === 'sending' && (
        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="size-3" /> Publishing…
        </p>
      )}
      {message.status === 'failed' && (
        <FailedNotice message={message} onRetry={controls.retry} onDiscard={controls.discard} />
      )}
    </article>
  );
}

function ChatItem({ message, group, me, grouped, seen }: ItemProps) {
  const mine = message.sender.id === me.id;
  const controls = useMessageControls(message, group, me);
  const time = formatTime(message.createdAt);

  if (mine) {
    return (
      <div
        className={cn(
          'group/message animate-in flex flex-col items-end',
          grouped ? 'mt-0.5' : 'mt-3',
        )}
      >
        <div className="flex max-w-[min(80%,36rem)] items-center gap-1">
          {controls.canDelete && <MessageActions onDelete={controls.remove} />}
          <div
            className={cn(
              'rounded-2xl rounded-br-md px-3.5 py-2 text-[14.5px] leading-relaxed break-words whitespace-pre-wrap',
              message.deleted
                ? 'border bg-surface text-muted-foreground'
                : 'bg-bubble-own text-bubble-own-foreground',
              message.status === 'sending' && 'opacity-70',
              message.status === 'failed' && 'bg-danger/80',
            )}
          >
            <Body message={message} />
          </div>
        </div>
        <span className="mt-0.5 flex items-center gap-1 pr-1 text-[11px] text-muted-foreground">
          {message.status === 'sending' ? (
            <>
              <Clock className="size-3" aria-hidden /> Sending
            </>
          ) : message.status ? null : (
            <>
              {time}
              {seen !== null &&
                (seen ? (
                  <span className="inline-flex items-center gap-0.5 text-primary">
                    <CheckCheck className="size-3.5" aria-hidden /> Seen
                  </span>
                ) : (
                  <Check className="size-3.5" aria-label="Sent" />
                ))}
            </>
          )}
        </span>
        {message.status === 'failed' && (
          <FailedNotice message={message} onRetry={controls.retry} onDiscard={controls.discard} />
        )}
      </div>
    );
  }

  return (
    <div className={cn('group/message animate-in flex gap-2.5', grouped ? 'mt-0.5' : 'mt-3')}>
      <div className="w-8 shrink-0">
        {!grouped && <Avatar name={message.sender.name} size="sm" />}
      </div>
      <div className="min-w-0 max-w-[min(80%,36rem)]">
        {!grouped && (
          <p className="mb-0.5 flex items-center gap-1.5 text-xs">
            <span className="font-semibold">{message.sender.name}</span>
            <RoleBadge person={message.sender} />
            <span className="text-muted-foreground">{time}</span>
          </p>
        )}
        <div className="flex items-center gap-1">
          <div
            className={cn(
              'rounded-2xl rounded-tl-md border bg-surface px-3.5 py-2 text-[14.5px] leading-relaxed break-words whitespace-pre-wrap',
              message.deleted && 'text-muted-foreground',
            )}
            title={grouped ? time : undefined}
          >
            <Body message={message} />
          </div>
          {controls.canDelete && <MessageActions onDelete={controls.remove} />}
        </div>
      </div>
    </div>
  );
}

function DayDivider({ iso }: { iso: string }) {
  return (
    <div className="my-4 flex items-center gap-3 text-[11px] font-medium text-muted-foreground">
      <span className="h-px flex-1 bg-border" aria-hidden />
      {formatDayLabel(iso)}
      <span className="h-px flex-1 bg-border" aria-hidden />
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

  const messages = useMemo<ClientMessage[]>(
    () => (data ? [...data.pages].reverse().flatMap((p) => p.messages) : []),
    [data],
  );
  const isNotice = group.type === 'CAMPUS_ANNOUNCEMENT' || group.type === 'DEPARTMENT_ANNOUNCEMENT';
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

  let content: ReactNode;
  if (isPending) {
    content = (
      <div className="flex flex-1 items-center justify-center py-10">
        <Spinner />
      </div>
    );
  } else if (isError) {
    content = (
      <div className="py-10 text-center text-sm">
        <p className="text-danger">Couldn't load messages.</p>
        <button
          type="button"
          className="mt-1 text-primary underline"
          onClick={() => void refetch()}
        >
          Try again
        </button>
      </div>
    );
  } else if (messages.length === 0) {
    content = (
      <EmptyState icon={MessageSquareDashed} title="No messages yet" className="my-auto">
        {group.type === 'DIRECT'
          ? `Say hello to ${group.peer?.name ?? 'them'}.`
          : 'Start the conversation. Everyone in this group will see it instantly.'}
      </EmptyState>
    );
  } else {
    content = messages.map((message, i) => {
      const prev = messages[i - 1];
      const newDay = !prev || !isSameDay(new Date(prev.createdAt), new Date(message.createdAt));
      const grouped =
        !newDay &&
        !!prev &&
        prev.sender.id === message.sender.id &&
        new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() <
          GROUP_WINDOW_MS;
      const seen =
        group.type === 'DIRECT' && message.id === myLast?.id
          ? !!seenUpTo && seenUpTo >= message.id
          : null;
      const props: ItemProps = { message, group, me, grouped, seen };
      return (
        <Fragment key={message.clientId ?? message.id}>
          {newDay && <DayDivider iso={message.createdAt} />}
          {isNotice ? (
            <div className="mt-3">
              <NoticeItem {...props} />
            </div>
          ) : (
            <ChatItem {...props} />
          )}
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
      className="scrollbar-thin flex flex-1 flex-col overflow-y-auto px-3 pb-2 sm:px-6"
      aria-live="polite"
      aria-relevant="additions"
    >
      <div ref={topRef} className="h-px shrink-0" />
      {isFetchingNextPage && (
        <div className="flex justify-center py-2">
          <Spinner />
        </div>
      )}
      {!hasNextPage && messages.length > 0 && (
        <p className="py-4 text-center text-xs text-muted-foreground">
          This is the beginning of {group.type === 'DIRECT' ? 'your conversation' : group.name}.
        </p>
      )}
      <div className={cn('mx-auto flex w-full max-w-4xl flex-1 flex-col', isNotice && 'max-w-3xl')}>
        {content}
      </div>
      <div className="mx-auto w-full max-w-4xl">
        <TypingIndicator groupId={group.id} />
      </div>
    </div>
  );
}
