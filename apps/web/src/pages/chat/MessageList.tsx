import {
  canDeleteMessage,
  describePostPolicy,
  type GroupDTO,
  toPolicyGroup,
  toPolicyMembership,
  toPolicyUser,
  type UserDTO,
} from '@cui/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Check, CheckCheck, Ellipsis, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import {
  Fragment,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import { useDeleteMessage, useMarkRead, useSendMessage } from '@/hooks/useChatActions';
import { type ClientMessage, removeMessage } from '@/lib/cache';
import { cn, formatDayLabel, formatTime, isSameDay } from '@/lib/utils';

const GROUP_WINDOW_MS = 5 * 60 * 1000;
const URL_PATTERN = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]])/g;
const shortTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

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
            className="text-link underline-offset-2 hover:underline"
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

interface RowProps {
  message: ClientMessage;
  group: GroupDTO;
  me: UserDTO;
  grouped: boolean;
  seen: boolean | null;
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

function MessageRow({ message, group, me, grouped, seen }: RowProps) {
  const controls = useMessageControls(message, group, me);
  const created = new Date(message.createdAt);

  return (
    <div
      className={cn(
        'group/message relative flex gap-2.5 px-5 transition-colors hover:bg-surface-2 has-[[data-state=open]]:bg-surface-2',
        grouped ? 'py-0.5' : 'mt-1.5 pt-1.5 pb-0.5',
        message.status === 'sending' && 'opacity-60',
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
        ) : (
          <Avatar name={message.sender.name} className="mt-0.5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-[15px] font-bold">{message.sender.name}</span>
            <RoleBadge person={message.sender} />
            <Tooltip content={created.toLocaleString()}>
              <time dateTime={message.createdAt} className="text-[12px] text-muted-foreground">
                {formatTime(message.createdAt)}
              </time>
            </Tooltip>
          </div>
        )}
        <div
          className={cn(
            'text-[15px] leading-[1.46] break-words whitespace-pre-wrap',
            message.deleted && 'text-muted-foreground italic',
          )}
        >
          {message.deleted ? 'This message was deleted.' : <Linkified text={message.body} />}
        </div>
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
      {controls.canDelete && (
        <div className="absolute -top-3.5 right-5 hidden rounded-lg border bg-surface p-0.5 shadow-sm group-focus-within/message:flex group-hover/message:flex pointer-coarse:flex has-[[data-state=open]]:flex">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Message options"
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Ellipsis className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem danger onSelect={controls.remove}>
                <Trash2 /> Delete message
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
          <MessageRow message={message} group={group} me={me} grouped={grouped} seen={seen} />
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
