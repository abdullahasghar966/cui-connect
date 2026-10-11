import { GROUP_TYPE_LABELS, type GroupDTO } from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, DoorOpen, MessageSquareText, Search, UserRound } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Kbd, Spinner } from '@/components/feedback';
import { GroupIcon } from '@/components/group-meta';
import { Avatar } from '@/components/people';
import { useGroups } from '@/hooks/queries';
import { useDebounced } from '@/hooks/useDebounced';
import { api } from '@/lib/api';
import { cn, formatListTime } from '@/lib/utils';
import { useUi } from '@/state/ui';

/** Ctrl/⌘ + K toggles the search palette from anywhere in the signed-in app. */
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

function rank(groups: GroupDTO[], query: string, limit: number): GroupDTO[] {
  const needle = query.trim().toLowerCase();
  const nameOf = (g: GroupDTO) => (g.type === 'DIRECT' ? (g.peer?.name ?? g.name) : g.name);
  if (!needle) {
    return [...groups]
      .sort(
        (a, b) =>
          Number(b.unread > 0) - Number(a.unread > 0) ||
          (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''),
      )
      .slice(0, limit);
  }
  return groups
    .filter((g) => nameOf(g).toLowerCase().includes(needle))
    .sort(
      (a, b) =>
        Number(nameOf(b).toLowerCase().startsWith(needle)) -
          Number(nameOf(a).toLowerCase().startsWith(needle)) || nameOf(a).localeCompare(nameOf(b)),
    )
    .slice(0, limit);
}

interface Item {
  id: string;
  section: string;
  icon: ReactNode;
  label: string;
  hint?: string;
  detail?: string;
  to: string;
}

/** One box for everything: chats, courses, teachers, rooms and messages you're allowed to read. */
export function QuickSwitcher() {
  const open = useUi((s) => s.switcherOpen);
  const setOpen = useUi((s) => s.setSwitcherOpen);
  const { data: groups = [] } = useGroups();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const term = useDebounced(query.trim(), 200);
  const remote = useQuery({
    queryKey: ['search', term],
    queryFn: () => api.search(term),
    enabled: open && term.length >= 2,
    staleTime: 30_000,
  });

  const items = useMemo<Item[]>(() => {
    const chats = rank(groups, query, query.trim() ? 5 : 8).map<Item>((g) => ({
      id: `chat-${g.id}`,
      section: 'Conversations',
      icon:
        g.type === 'DIRECT' && g.peer ? (
          <Avatar name={g.peer.name} size="xs" />
        ) : (
          <GroupIcon type={g.type} settings={g.settings} />
        ),
      label: g.type === 'DIRECT' ? (g.peer?.name ?? g.name) : g.name,
      hint: g.unread > 0 ? `${g.unread} unread` : GROUP_TYPE_LABELS[g.type],
      to: `/chat/${g.id}`,
    }));
    const data = term.length >= 2 && term === query.trim() ? remote.data : undefined;
    if (!data) return chats;
    return [
      ...chats,
      ...data.courses.map<Item>((c) => ({
        id: `course-${c.code}`,
        section: 'Courses',
        icon: <BookOpen className="size-4" />,
        label: `${c.code} ${c.title}`,
        hint: c.departmentCode ?? undefined,
        to: `/academics/courses/${c.code}`,
      })),
      ...data.teachers.map<Item>((t) => ({
        id: `teacher-${t.id}`,
        section: 'Teachers',
        icon: <UserRound className="size-4" />,
        label: t.name,
        hint: [t.designation, t.departmentCode].filter(Boolean).join(' · '),
        to: `/academics/teachers?q=${encodeURIComponent(t.name)}`,
      })),
      ...data.rooms.map<Item>((r) => ({
        id: `room-${r.id}`,
        section: 'Rooms',
        icon: <DoorOpen className="size-4" />,
        label: r.name,
        hint: r.block,
        to: `/academics/timetable?view=room&id=${r.id}`,
      })),
      ...data.messages.map<Item>((m) => ({
        id: `message-${m.id}`,
        section: 'Messages',
        icon: <MessageSquareText className="size-4" />,
        label: m.snippet,
        hint: formatListTime(m.createdAt),
        detail: `${m.sender} in ${m.groupName}`,
        to: `/chat/${m.groupId}?message=${m.id}`,
      })),
      {
        id: 'all-messages',
        section: 'Messages',
        icon: <Search className="size-4" />,
        label: `Search all messages for “${term}”`,
        to: `/search?q=${encodeURIComponent(term)}`,
      },
    ];
  }, [groups, query, term, remote.data]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the highlight when the query changes
  useEffect(() => setActive(0), [query]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const go = (item: Item) => {
    close();
    navigate(item.to);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const target = items[active];
      if (target) go(target);
    }
  };

  const searching = remote.isFetching && term.length >= 2;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="animate-in fixed inset-0 z-40 bg-black/40" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="dialog-in fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border bg-surface shadow-[0_24px_64px_rgb(0_0_0/0.25)]"
        >
          <DialogPrimitive.Title className="sr-only">Search CUI Connect</DialogPrimitive.Title>
          <div className="flex items-center gap-2.5 border-b px-4">
            <Search className="size-[18px] text-muted-foreground" aria-hidden />
            <input
              // biome-ignore lint/a11y/noAutofocus: the palette exists to type into immediately
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search chats, courses, teachers, rooms and messages…"
              aria-label="Search CUI Connect"
              role="combobox"
              aria-expanded
              aria-controls="switcher-results"
              aria-activedescendant={items[active] ? `switcher-${items[active].id}` : undefined}
              className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
            />
            {searching ? <Spinner /> : <Kbd className="text-muted-foreground">Esc</Kbd>}
          </div>
          {/* Focus stays in the input; the highlighted option is announced via aria-activedescendant. */}
          <div
            id="switcher-results"
            role="listbox"
            aria-label="Search results"
            className="max-h-[60vh] overflow-y-auto py-1.5 empty:hidden"
          >
            {items.map((item, index) => {
              const first = index === 0 || items[index - 1]?.section !== item.section;
              const on = index === active;
              return (
                <div key={item.id}>
                  {first && (
                    <p
                      aria-hidden
                      className="px-4 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
                    >
                      {item.section}
                    </p>
                  )}
                  <div
                    id={`switcher-${item.id}`}
                    role="option"
                    tabIndex={-1}
                    aria-selected={on}
                    onMouseMove={() => setActive(index)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      go(item);
                    }}
                    className={cn(
                      'mx-1.5 flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[14px]',
                      on && 'bg-primary text-primary-foreground',
                    )}
                  >
                    <span className={cn('shrink-0', !on && 'text-muted-foreground')}>
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{item.label}</span>
                      {item.detail && (
                        <span
                          className={cn(
                            'block truncate text-[12px]',
                            on ? 'text-primary-foreground/80' : 'text-muted-foreground',
                          )}
                        >
                          {item.detail}
                        </span>
                      )}
                    </span>
                    {item.hint && (
                      <span
                        className={cn(
                          'ml-auto shrink-0 text-[12px]',
                          on ? 'text-primary-foreground/80' : 'text-muted-foreground',
                        )}
                      >
                        {item.hint}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {items.length === 0 && (
            <p className="px-4 py-6 text-center text-[13.5px] text-muted-foreground">
              {query.trim().length >= 2 && !searching
                ? `Nothing matches “${query.trim()}”.`
                : 'Type at least two letters to search everything.'}
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
            <span className="ml-auto hidden sm:inline">Messages only from chats you can read</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
