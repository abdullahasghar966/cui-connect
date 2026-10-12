/** Parts of a chat message beyond its text: mentions, the reply quote, reactions. */
import {
  type GroupDTO,
  type MessageDTO,
  REACTIONS,
  type Reaction,
  type ReplyRefDTO,
  type UserDTO,
} from '@cui/shared';
import { SmilePlus } from 'lucide-react';
import { DropdownMenu as Menu } from 'radix-ui';
import { Fragment } from 'react';
import { useMembers } from '@/hooks/queries';
import { useReact } from '@/hooks/useChatActions';
import { cn } from '@/lib/utils';

const URL_PATTERN = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]])/g;
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "@Hira Khan" spans for the people this message mentions; the one that is you stands out. */
function Mentioned({
  text,
  mentions,
  me,
}: {
  text: string;
  mentions: MessageDTO['mentions'];
  me: UserDTO;
}) {
  if (!mentions.length) return <>{text}</>;
  const names = [...mentions].sort((a, b) => b.name.length - a.name.length);
  const pattern = new RegExp(
    `(@(?:${names.map((m) => escapeRegex(m.name)).join('|')}))(?![\\p{L}\\p{N}])`,
    'giu',
  );
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) {
          // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and immutable
          return <Fragment key={i}>{part}</Fragment>;
        }
        const who = names.find((m) => `@${m.name}`.toLowerCase() === part.toLowerCase());
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and immutable
            key={i}
            className={cn(
              'rounded-[3px] px-0.5 font-semibold',
              who?.id === me.id
                ? 'bg-warning-soft text-warning'
                : 'bg-primary-soft text-primary dark:text-link',
            )}
          >
            {part}
          </span>
        );
      })}
    </>
  );
}

/** Message text: http(s) links clickable, mentions highlighted, everything else plain (XSS-safe). */
export function MessageText({ message, me }: { message: MessageDTO; me: UserDTO }) {
  const parts = message.body.split(URL_PATTERN);
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
          <Mentioned key={i} text={part} mentions={message.mentions} me={me} />
        ),
      )}
    </>
  );
}

/** The quoted message a reply answers; clicking jumps to it. */
export function ReplyQuote({ reply, onJump }: { reply: ReplyRefDTO; onJump: () => void }) {
  return (
    <button
      type="button"
      onClick={onJump}
      disabled={reply.deleted}
      aria-label={`Replying to ${reply.senderName}${reply.deleted ? '' : `: ${reply.snippet}`}`}
      className="mb-0.5 flex max-w-full items-baseline gap-1.5 rounded border-l-2 border-border-strong bg-surface-2 px-2 py-0.5 text-left text-[13px] text-muted-foreground enabled:hover:border-primary enabled:hover:text-foreground"
    >
      <span className="shrink-0 font-semibold text-foreground">{reply.senderName}</span>
      <span className="truncate">
        {reply.deleted ? <i>The original message was deleted.</i> : reply.snippet}
      </span>
    </button>
  );
}

/** Reaction chips under a message: count, yours highlighted, click to add or take back. */
export function Reactions({
  message,
  group,
  me,
}: {
  message: MessageDTO;
  group: GroupDTO;
  me: UserDTO;
}) {
  const react = useReact();
  // Names for the tooltip come from the member list when it has been loaded.
  const { data: members } = useMembers(group.id, false);
  if (!message.reactions.length) return null;
  const nameOf = (id: string) =>
    id === me.id ? 'You' : (members?.find((m) => m.user.id === id)?.user.name ?? 'Someone');
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {message.reactions.map((r) => {
        const mine = r.userIds.includes(me.id);
        const who = r.userIds.map(nameOf).join(', ');
        return (
          <button
            key={r.emoji}
            type="button"
            title={who}
            aria-pressed={mine}
            aria-label={`${r.emoji} ${r.userIds.length}: ${who}`}
            onClick={() => void react(group.id, message.id, r.emoji as Reaction)}
            className={cn(
              'inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[12.5px] tabular-nums transition-colors',
              mine
                ? 'border-primary/40 bg-primary-soft font-semibold text-primary dark:text-link'
                : 'bg-surface hover:bg-muted',
            )}
          >
            <span aria-hidden>{r.emoji}</span>
            {r.userIds.length}
          </button>
        );
      })}
    </div>
  );
}

/** The six quick reactions, from the message's hover toolbar. */
export function ReactionPicker({
  message,
  group,
  className,
}: {
  message: MessageDTO;
  group: GroupDTO;
  className?: string;
}) {
  const react = useReact();
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <button type="button" aria-label="Add reaction" className={className}>
          <SmilePlus className="size-4" />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={6}
          aria-label="Reactions"
          className="animate-in z-50 flex gap-0.5 rounded-lg border bg-surface p-1 shadow-[0_8px_28px_rgb(0_0_0/0.16)]"
        >
          {REACTIONS.map((emoji) => (
            <Menu.Item
              key={emoji}
              aria-label={`React with ${emoji}`}
              onSelect={() => void react(group.id, message.id, emoji)}
              className="flex size-8 cursor-pointer items-center justify-center rounded-md text-[18px] outline-none data-[highlighted]:bg-muted"
            >
              {emoji}
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
