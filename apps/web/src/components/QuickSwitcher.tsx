import { GROUP_TYPE_LABELS, type GroupDTO } from '@cui/shared';
import { Search } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { type KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Kbd } from '@/components/feedback';
import { GroupIcon } from '@/components/group-meta';
import { Avatar } from '@/components/people';
import { useGroups } from '@/hooks/queries';
import { cn } from '@/lib/utils';
import { useUi } from '@/state/ui';

/** Ctrl/⌘ + K toggles the switcher from anywhere in the signed-in app. */
export function useSwitcherShortcut() {
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        const { switcherOpen, setSwitcherOpen } = useUi.getState();
        setSwitcherOpen(!switcherOpen);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

function rank(groups: GroupDTO[], query: string): GroupDTO[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [...groups]
      .sort(
        (a, b) =>
          Number(b.unread > 0) - Number(a.unread > 0) ||
          (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''),
      )
      .slice(0, 8);
  }
  return groups
    .filter((g) => g.name.toLowerCase().includes(needle))
    .sort(
      (a, b) =>
        Number(b.name.toLowerCase().startsWith(needle)) -
          Number(a.name.toLowerCase().startsWith(needle)) || a.name.localeCompare(b.name),
    )
    .slice(0, 8);
}

export function QuickSwitcher() {
  const open = useUi((s) => s.switcherOpen);
  const setOpen = useUi((s) => s.setSwitcherOpen);
  const { data: groups = [] } = useGroups();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const results = useMemo(() => rank(groups, query), [groups, query]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the highlight when the query changes
  useEffect(() => setActive(0), [query]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const go = (group: GroupDTO) => {
    close();
    navigate(`/chat/${group.id}`);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const target = results[active];
      if (target) go(target);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="animate-in fixed inset-0 z-40 bg-black/40" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="dialog-in fixed top-[14vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border bg-surface shadow-[0_24px_64px_rgb(0_0_0/0.25)]"
        >
          <DialogPrimitive.Title className="sr-only">Jump to a conversation</DialogPrimitive.Title>
          <div className="flex items-center gap-2.5 border-b px-4">
            <Search className="size-[18px] text-muted-foreground" aria-hidden />
            <input
              // biome-ignore lint/a11y/noAutofocus: the switcher exists to type into immediately
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Jump to a conversation…"
              aria-label="Jump to a conversation"
              role="combobox"
              aria-expanded
              aria-controls="switcher-results"
              aria-activedescendant={results[active] ? `switcher-${results[active].id}` : undefined}
              className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
            />
            <Kbd className="text-muted-foreground">Esc</Kbd>
          </div>
          {/* Focus stays in the input; the highlighted option is announced via aria-activedescendant. */}
          <div
            id="switcher-results"
            role="listbox"
            aria-label="Matching conversations"
            className="max-h-80 overflow-y-auto py-1.5 empty:hidden"
          >
            {results.map((group, index) => (
              <div
                key={group.id}
                id={`switcher-${group.id}`}
                role="option"
                tabIndex={-1}
                aria-selected={index === active}
                onMouseMove={() => setActive(index)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(group);
                }}
                className={cn(
                  'mx-1.5 flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[14px]',
                  index === active && 'bg-primary text-primary-foreground',
                )}
              >
                {group.type === 'DIRECT' && group.peer ? (
                  <Avatar name={group.peer.name} size="xs" />
                ) : (
                  <GroupIcon
                    type={group.type}
                    settings={group.settings}
                    className={cn(index !== active && 'text-muted-foreground')}
                  />
                )}
                <span className="truncate font-medium">{group.name}</span>
                <span
                  className={cn(
                    'ml-auto shrink-0 text-[12px]',
                    index === active ? 'text-primary-foreground/80' : 'text-muted-foreground',
                  )}
                >
                  {group.unread > 0 ? `${group.unread} unread` : GROUP_TYPE_LABELS[group.type]}
                </span>
              </div>
            ))}
          </div>
          {results.length === 0 && (
            <p className="px-4 py-6 text-center text-[13.5px] text-muted-foreground">
              {query.trim() ? `No conversations match “${query.trim()}”.` : 'No conversations yet.'}
            </p>
          )}
          <div className="flex items-center gap-3 border-t bg-surface-2 px-4 py-2 text-[12px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> to navigate
            </span>
            <span className="flex items-center gap-1">
              <Kbd>Enter</Kbd> to open
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
