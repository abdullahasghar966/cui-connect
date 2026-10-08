import {
  canPost,
  type GroupDTO,
  MESSAGE_MAX_LENGTH,
  toPolicyGroup,
  toPolicyMembership,
  toPolicyUser,
} from '@cui/shared';
import { BellOff, Lock, SendHorizontal } from 'lucide-react';
import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useCurrentUser } from '@/hooks/queries';
import { useSendMessage } from '@/hooks/useChatActions';
import { getSocket } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { TypingIndicator } from './TypingIndicator';

const TYPING_REPEAT_MS = 2500;
const TYPING_IDLE_MS = 3000;

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

export function Composer({ group }: { group: GroupDTO }) {
  const me = useCurrentUser();
  const send = useSendMessage();
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastTypingSent = useRef(0);
  const idleTimer = useRef<number | undefined>(undefined);
  const tick = useMuteExpiry(group.mutedUntil);

  // The same rule the server enforces, evaluated locally only to explain a disabled composer.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `tick` re-runs the check when a mute expires
  const decision = useMemo(
    () => canPost(toPolicyUser(me), toPolicyGroup(group), toPolicyMembership(group)),
    [me, group, tick],
  );

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

  const onChange = (value: string) => {
    setText(value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
    }
    if (!value.trim()) {
      stopTyping();
      return;
    }
    const now = Date.now();
    if (now - lastTypingSent.current > TYPING_REPEAT_MS) {
      getSocket().emit('typing:start', { groupId: group.id });
      lastTypingSent.current = now;
    }
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(stopTyping, TYPING_IDLE_MS);
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
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    void send(group.id, body);
    textareaRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
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
  const placeholder =
    group.type === 'DIRECT' && group.peer ? `Message ${group.peer.name}` : `Message ${group.name}`;

  return (
    <div className="shrink-0 px-5 pt-1">
      <form
        onSubmit={submit}
        className="rounded-lg border border-border-strong bg-surface transition-shadow focus-within:border-foreground/35 focus-within:shadow-[0_1px_8px_rgb(0_0_0/0.07)]"
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={stopTyping}
          rows={1}
          placeholder={placeholder}
          aria-label={placeholder}
          className="block max-h-48 min-h-[46px] w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-[15px] leading-snug outline-none placeholder:text-muted-foreground/80"
        />
        <div className="flex items-center gap-2 px-2 pb-2">
          <span className="hidden pl-1.5 text-[11.5px] text-muted-foreground sm:inline">
            <span className="font-semibold">Enter</span> to send ·{' '}
            <span className="font-semibold">Shift + Enter</span> for a new line
          </span>
          <span className="ml-auto flex items-center gap-2">
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
    </div>
  );
}
