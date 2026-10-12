import {
  canPost,
  canPostAnonymously,
  type GroupDTO,
  MESSAGE_MAX_LENGTH,
  type MessageDTO,
  type ReplyRefDTO,
  toPolicyGroup,
  toPolicyMembership,
  toPolicyUser,
} from '@cui/shared';
import {
  BellOff,
  ChartNoAxesColumn,
  Lock,
  Reply,
  SendHorizontal,
  VenetianMask,
  X,
} from 'lucide-react';
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/people';
import { useCurrentUser, useMembers } from '@/hooks/queries';
import { useSendMessage } from '@/hooks/useChatActions';
import { getSocket } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { useUi } from '@/state/ui';
import { PollDialog } from './PollDialog';
import { TypingIndicator } from './TypingIndicator';

const TYPING_REPEAT_MS = 2500;
const TYPING_IDLE_MS = 3000;
/** "@" then up to 30 characters of a name, right before the caret. */
const MENTION_QUERY = /(?:^|[\s(])@([^\n@]{0,30})$/;

/** Re-evaluates permissions when a mute expires, without waiting for another event. */
function useMuteExpiry(mutedUntil: string | null): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!mutedUntil) return;
    const remaining = new Date(mutedUntil).getTime() - Date.now();
    if (remaining <= 0) return;
    const timer = window.setTimeout(
      () => setTick((t) => t + 1),
      Math.min(remaining + 500, 2 ** 31 - 1),
    );
    return () => window.clearTimeout(timer);
  }, [mutedUntil]);
  return tick;
}

/** What a reply shows of the message it answers (the server stores the same snapshot). */
function replyRef(message: MessageDTO, meId: string): ReplyRefDTO {
  const text = message.kind === 'poll' ? `Poll: ${message.body}` : message.body;
  return {
    id: message.id,
    senderName:
      message.anonymous && message.sender.id !== meId ? 'Anonymous student' : message.sender.name,
    snippet: text.length > 140 ? `${text.slice(0, 139).trimEnd()}…` : text,
    deleted: false,
  };
}

export function Composer({ group }: { group: GroupDTO }) {
  const me = useCurrentUser();
  const send = useSendMessage();
  const [text, setText] = useState('');
  const [pollOpen, setPollOpen] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [mentioned, setMentioned] = useState<{ id: string; name: string }[]>([]);
  const [query, setQuery] = useState<{ start: number; text: string } | null>(null);
  const [active, setActive] = useState(0);
  const replyTo = useUi((s) => s.replyTo[group.id]);
  const setReplyTo = useUi((s) => s.setReplyTo);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastTypingSent = useRef(0);
  const idleTimer = useRef<number | undefined>(undefined);
  const tick = useMuteExpiry(group.mutedUntil);
  const listId = useId();
  const { data: members } = useMembers(group.id, group.type !== 'DIRECT');

  // The same rules the server enforces, evaluated locally only to shape the composer.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `tick` re-runs the check when a mute expires
  const decision = useMemo(
    () => canPost(toPolicyUser(me), toPolicyGroup(group), toPolicyMembership(group)),
    [me, group, tick],
  );
  const canAsk = canPostAnonymously(
    toPolicyUser(me),
    toPolicyGroup(group),
    toPolicyMembership(group),
  ).allowed;

  const suggestions = useMemo(() => {
    if (!query || !members) return [];
    const q = query.text.toLowerCase();
    return members
      .filter((m) => m.user.id !== me.id)
      .filter((m) => {
        const name = m.user.name.toLowerCase();
        return name.startsWith(q) || name.split(/\s+/).some((word) => word.startsWith(q));
      })
      .slice(0, 6);
  }, [query, members, me.id]);
  const showSuggestions = !anonymous && suggestions.length > 0;

  const stopTyping = () => {
    window.clearTimeout(idleTimer.current);
    if (lastTypingSent.current) {
      getSocket().emit('typing:stop', { groupId: group.id });
      lastTypingSent.current = 0;
    }
  };

  // Tell others we stopped typing when leaving the conversation (the composer is keyed per group).
  // biome-ignore lint/correctness/useExhaustiveDependencies: unmount-only cleanup
  useEffect(() => () => stopTyping(), []);

  /** Looks for an "@name" being typed right before the caret. */
  const findQuery = (value: string, caret: number) => {
    const match = MENTION_QUERY.exec(value.slice(0, caret));
    const found = match
      ? { start: caret - (match[1] ?? '').length - 1, text: match[1] ?? '' }
      : null;
    setQuery(found);
    setActive(0);
  };

  const onChange = (value: string) => {
    setText(value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
      findQuery(value, el.selectionStart);
    }
    if (!value.trim()) {
      stopTyping();
      return;
    }
    // Typing indicators would give an anonymous question away.
    if (anonymous) return;
    const now = Date.now();
    if (now - lastTypingSent.current > TYPING_REPEAT_MS) {
      getSocket().emit('typing:start', { groupId: group.id });
      lastTypingSent.current = now;
    }
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(stopTyping, TYPING_IDLE_MS);
  };

  const pick = (person: { id: string; name: string }) => {
    const el = textareaRef.current;
    if (!query || !el) return;
    const caret = el.selectionStart;
    const inserted = `@${person.name} `;
    const next = `${text.slice(0, query.start)}${inserted}${text.slice(caret)}`;
    setText(next);
    setMentioned((list) => (list.some((p) => p.id === person.id) ? list : [...list, person]));
    setQuery(null);
    const position = query.start + inserted.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(position, position);
    });
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const body = text.trim();
    if (!body) return;
    if (body.length > MESSAGE_MAX_LENGTH) {
      toast.error(`Messages are limited to ${MESSAGE_MAX_LENGTH} characters.`);
      return;
    }
    stopTyping();
    setText('');
    setQuery(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    void send(group.id, body, {
      replyTo: replyTo ? replyRef(replyTo, me.id) : null,
      // Only names still in the text count.
      mentions: anonymous ? [] : mentioned.filter((p) => body.includes(`@${p.name}`)),
      anonymous,
    });
    setMentioned([]);
    setAnonymous(false);
    setReplyTo(group.id, undefined);
    textareaRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestions) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActive((i) => (i + step + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const person = suggestions[active];
        if (person) pick({ id: person.user.id, name: person.user.name });
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setQuery(null);
        return;
      }
    }
    if (event.key === 'Escape' && replyTo) {
      setReplyTo(group.id, undefined);
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  if (!decision.allowed) {
    const Icon = decision.code === 'MUTED' ? BellOff : Lock;
    return (
      <div className="shrink-0 px-5 pt-1 pb-5">
        <p
          className={cn(
            'flex items-center gap-2.5 rounded-lg border bg-surface-2 px-3.5 py-3 text-[13.5px] text-muted-foreground',
            decision.code === 'MUTED' && 'border-warning/30 bg-warning-soft text-warning',
          )}
          data-testid="composer-locked"
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          {decision.reason}
        </p>
      </div>
    );
  }

  const remaining = MESSAGE_MAX_LENGTH - text.length;
  const hasText = !!text.trim();
  const placeholder = anonymous
    ? `Ask ${group.name} anonymously`
    : group.type === 'DIRECT' && group.peer
      ? `Message ${group.peer.name}`
      : `Message ${group.name}`;
  const quoted = replyTo ? replyRef(replyTo, me.id) : null;

  return (
    <div className="relative shrink-0 px-5 pt-1">
      {/* Focus stays in the textarea; the highlighted person is announced via aria-activedescendant. */}
      {showSuggestions && (
        <div
          id={listId}
          role="listbox"
          aria-label="People to mention"
          className="absolute bottom-full left-5 z-30 mb-1 w-72 overflow-hidden rounded-lg border bg-surface py-1 shadow-[0_8px_28px_rgb(0_0_0/0.16)]"
        >
          {suggestions.map((m, i) => (
            <div
              key={m.user.id}
              id={`${listId}-${i}`}
              role="option"
              tabIndex={-1}
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick({ id: m.user.id, name: m.user.name });
              }}
              onMouseMove={() => setActive(i)}
              className={cn(
                'flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[14px]',
                i === active && 'bg-primary text-primary-foreground',
              )}
            >
              <Avatar name={m.user.name} size="xs" />
              <span className="truncate font-semibold">{m.user.name}</span>
            </div>
          ))}
        </div>
      )}
      <form
        onSubmit={submit}
        className={cn(
          'rounded-lg border border-border-strong bg-surface transition-shadow focus-within:border-foreground/35 focus-within:shadow-[0_1px_8px_rgb(0_0_0/0.07)]',
          anonymous && 'border-dashed',
        )}
      >
        {quoted && (
          <div className="flex items-center gap-2 border-b px-3 py-1.5 text-[13px]">
            <Reply className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              Replying to <b className="text-foreground">{quoted.senderName}</b>: {quoted.snippet}
            </span>
            <button
              type="button"
              aria-label="Cancel reply"
              onClick={() => setReplyTo(group.id, undefined)}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
        {anonymous && (
          <p className="flex items-center gap-2 border-b px-3 py-1.5 text-[12.5px] text-muted-foreground">
            <VenetianMask className="size-3.5 shrink-0" aria-hidden />
            Your name is hidden from everyone, including your teacher. Moderators can still remove
            it.
          </p>
        )}
        <textarea
          ref={textareaRef}
          data-composer
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onClick={(e) => findQuery(text, e.currentTarget.selectionStart)}
          onBlur={() => {
            stopTyping();
            setQuery(null);
          }}
          rows={1}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-autocomplete="list"
          aria-controls={showSuggestions ? listId : undefined}
          aria-activedescendant={showSuggestions ? `${listId}-${active}` : undefined}
          className="block max-h-48 min-h-[46px] w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-[15px] leading-snug outline-none placeholder:text-muted-foreground/80"
        />
        <div className="flex items-center gap-2 px-2 pb-2">
          <span className="hidden pl-1.5 text-[11.5px] text-muted-foreground sm:inline">
            <span className="font-semibold">Enter</span> to send ·{' '}
            <span className="font-semibold">Shift + Enter</span> for a new line
            {group.type !== 'DIRECT' && (
              <>
                {' '}
                · <span className="font-semibold">@</span> to mention
              </>
            )}
          </span>
          <span className="ml-auto flex items-center gap-2">
            {canAsk && (
              <button
                type="button"
                aria-label="Ask anonymously"
                aria-pressed={anonymous}
                title="Ask anonymously"
                onClick={() => {
                  setAnonymous((v) => !v);
                  stopTyping();
                  setQuery(null);
                }}
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-md px-2 text-[12.5px] font-semibold transition-colors',
                  anonymous
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <VenetianMask className="size-4" />
                <span className="hidden sm:inline">Anonymous</span>
              </button>
            )}
            <button
              type="button"
              aria-label="Create poll"
              title="Create poll"
              onClick={() => setPollOpen(true)}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChartNoAxesColumn className="size-4" />
            </button>
            {remaining < 500 && (
              <span
                className={cn(
                  'text-[11.5px] text-muted-foreground tabular-nums',
                  remaining < 0 && 'text-danger',
                )}
              >
                {remaining}
              </span>
            )}
            <button
              type="submit"
              disabled={!hasText}
              aria-label="Send message"
              className={cn(
                'flex size-8 items-center justify-center rounded-md transition-colors',
                hasText
                  ? 'bg-primary text-primary-foreground hover:bg-primary-hover'
                  : 'text-muted-foreground/50',
              )}
            >
              <SendHorizontal className="size-4" />
            </button>
          </span>
        </div>
      </form>
      <TypingIndicator groupId={group.id} />
      <PollDialog group={group} open={pollOpen} onOpenChange={setPollOpen} />
    </div>
  );
}
