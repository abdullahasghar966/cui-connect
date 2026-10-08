import type { GroupDTO } from '@cui/shared';
import { CheckCheck } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState, Kbd, Spinner } from '@/components/feedback';
import { GroupIcon } from '@/components/group-meta';
import { Avatar } from '@/components/people';
import { useCurrentUser, useGroups } from '@/hooks/queries';
import { formatListTime, MOD_KEY } from '@/lib/utils';

function preview(group: GroupDTO, meId: string): string {
  const last = group.lastMessage;
  if (!last) return group.description ?? '';
  if (last.deleted) return 'Message deleted';
  if (last.sender.id === meId) return `You: ${last.body}`;
  if (group.type === 'DIRECT') return last.body;
  const first = last.sender.name.replace(/^(Dr|Mr|Ms|Mrs)\.?\s+/, '').split(' ')[0];
  return `${first}: ${last.body}`;
}

/** Home: every conversation with something new, most recent first. */
export function ChatHome() {
  const me = useCurrentUser();
  const { data: groups = [], isPending } = useGroups();
  const unread = groups
    .filter((g) => g.unread > 0)
    .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''));
  const total = unread.reduce((sum, g) => sum + g.unread, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-6">
        <h1 className="text-[17px] font-bold">Unreads</h1>
        {unread.length > 0 && (
          <span className="text-[13px] text-muted-foreground">
            {total} new {total === 1 ? 'message' : 'messages'} in {unread.length}{' '}
            {unread.length === 1 ? 'conversation' : 'conversations'}
          </span>
        )}
      </header>
      <div className="scrollbar-thin flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-6">
          {isPending ? (
            <Spinner />
          ) : unread.length === 0 ? (
            <EmptyState icon={CheckCheck} title="You’re all caught up" className="py-20">
              New messages from your classes, courses and offices show up here.
              <span className="pointer-coarse:hidden">
                {' '}
                Press <Kbd>{MOD_KEY}</Kbd> <Kbd>K</Kbd> to jump to any conversation.
              </span>
            </EmptyState>
          ) : (
            <ul className="divide-y overflow-hidden rounded-lg border">
              {unread.map((group) => (
                <li key={group.id}>
                  <Link
                    to={`/chat/${group.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
                  >
                    {group.type === 'DIRECT' && group.peer ? (
                      <Avatar name={group.peer.name} />
                    ) : (
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-surface-2 text-muted-foreground">
                        <GroupIcon type={group.type} settings={group.settings} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate text-[14.5px] font-bold">{group.name}</span>
                        <span className="ml-auto shrink-0 text-[12px] text-muted-foreground">
                          {formatListTime(group.lastMessageAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[13.5px] text-muted-foreground">
                        {preview(group, me.id)}
                      </span>
                    </span>
                    <span className="min-w-6 rounded-full bg-primary px-2 text-center text-[12px] leading-5 font-bold text-primary-foreground">
                      {group.unread >= 99 ? '99+' : group.unread}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
