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
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/queries';
import { useSendMessage } from '@/hooks/useChatActions';
import { getSocket } from '@/lib/socket';
import { cn } from '@/lib/utils';

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
      <div className="border-t bg-surface-2 px-4 py-3">
        <p
          className={cn(
            'mx-auto flex max-w-4xl items-center gap-2 rounded-xl border border-dashed px-3 py-2.5 text-sm text-muted-foreground',
            decision.code === 'MUTED' && 'border-warning/40 bg-warning-soft text-warning',
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
  const placeholder =
    group.type === 'DIRECT' && group.peer ? `Message ${group.peer.name}` : `Message ${group.name}`;

  return (
    <form onSubmit={submit} className="border-t bg-surface px-3 py-3 sm:px-4">
      <div className="mx-auto flex max-w-4xl items-end gap-2 rounded-2xl border bg-surface-2 p-1.5 pl-3 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/15">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={stopTyping}
          rows={1}
          placeholder={placeholder}
          aria-label={placeholder}
          className="max-h-44 min-h-9 flex-1 resize-none bg-transparent py-2 text-[14.5px] leading-snug outline-none placeholder:text-muted-foreground/70"
        />
        <Button type="submit" size="icon" disabled={!text.trim()} aria-label="Send message">
          <SendHorizontal />
        </Button>
      </div>
      <div className="mx-auto mt-1 flex max-w-4xl justify-between px-1 text-[11px] text-muted-foreground">
        <span className="hidden sm:inline">Enter to send · Shift + Enter for a new line</span>
        {remaining < 500 && (
          <span className={cn(remaining < 0 && 'text-danger')}>{remaining} characters left</span>
        )}
      </div>
    </form>
  );
}
