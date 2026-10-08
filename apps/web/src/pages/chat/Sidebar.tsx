import type { GroupDTO } from '@cui/shared';
import {
  BellOff,
  ChevronDown,
  Compass,
  LayoutDashboard,
  Lock,
  Plus,
  Search,
  SquarePen,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Kbd } from '@/components/feedback';
import { GroupIcon, SIDEBAR_SECTIONS } from '@/components/group-meta';
import { Avatar } from '@/components/people';
import { UserMenu } from '@/components/UserMenu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
} from '@/components/ui/menu';
import { useCurrentUser, useGroups } from '@/hooks/queries';
import { cn, MOD_KEY, storage } from '@/lib/utils';
import { useRealtime } from '@/state/realtime';
import { useUi } from '@/state/ui';

const COLLAPSED_KEY = 'cui-sidebar-collapsed';

function readCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(storage.get(COLLAPSED_KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

function SidebarItem({ group, active }: { group: GroupDTO; active: boolean }) {
  const online = useRealtime((s) => (group.peer ? s.online.has(group.peer.id) : false));
  const unread = group.unread > 0 && !active;
  const muted = !!group.mutedUntil && new Date(group.mutedUntil) > new Date();

  return (
    <li>
      <Link
        to={`/chat/${group.id}`}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'mx-2 flex h-7 items-center gap-2 rounded-md px-2 text-[14.5px] transition-colors',
          active
            ? 'bg-sidebar-active text-white'
            : unread
              ? 'font-bold text-white hover:bg-sidebar-hover'
              : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground',
        )}
      >
        {group.type === 'DIRECT' && group.peer ? (
          <Avatar
            name={group.peer.name}
            size="xs"
            online={online}
            ring={active ? 'active' : 'sidebar'}
          />
        ) : (
          <GroupIcon type={group.type} settings={group.settings} className="size-[15px]" />
        )}
        <span className="min-w-0 flex-1 truncate">{group.name}</span>
        {group.settings.locked && (
          <Lock className="size-3 shrink-0 opacity-70" aria-label="announcement-only" />
        )}
        {muted && <BellOff className="size-3 shrink-0 text-warning" aria-label="muted" />}
        {unread && (
          <span className="min-w-[20px] rounded-full bg-sidebar-badge px-1.5 text-center text-[11px] leading-[18px] font-bold text-white">
            {group.unread >= 99 ? '99+' : group.unread}
          </span>
        )}
      </Link>
    </li>
  );
}

function ActionRow({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Plus;
  label: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="mx-2 flex h-7 w-[calc(100%-1rem)] items-center gap-2 rounded-md px-2 text-left text-[14px] text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground"
      >
        <span className="flex size-[15px] items-center justify-center rounded-[4px] bg-white/10">
          <Icon className="size-3" aria-hidden />
        </span>
        {label}
      </button>
    </li>
  );
}

export function Sidebar({
  activeGroupId,
  className,
}: {
  activeGroupId: string | undefined;
  className?: string;
}) {
  const me = useCurrentUser();
  const navigate = useNavigate();
  const { data: groups, isPending, isError, refetch } = useGroups();
  const setSwitcherOpen = useUi((s) => s.setSwitcherOpen);
  const setNewMessageOpen = useUi((s) => s.setNewMessageOpen);
  const setDiscoverOpen = useUi((s) => s.setDiscoverOpen);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggle = (title: string) =>
    setCollapsed((current) => {
      const next = { ...current, [title]: !current[title] };
      storage.set(COLLAPSED_KEY, JSON.stringify(next));
      return next;
    });

  return (
    <aside className={cn('flex h-full flex-col bg-sidebar text-sidebar-foreground', className)}>
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-sidebar-border pr-2.5 pl-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 items-center gap-1 rounded-md px-2 py-1 text-[15.5px] font-bold text-white hover:bg-sidebar-hover"
            >
              <span className="truncate">COMSATS Islamabad</span>
              <ChevronDown className="size-4 shrink-0 opacity-70" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <div className="px-3.5 pt-1 pb-2">
              <p className="text-[14.5px] font-bold">CUI Connect</p>
              <p className="text-[12.5px] text-muted-foreground">COMSATS University Islamabad</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setNewMessageOpen(true)}>
              <SquarePen /> New message
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDiscoverOpen(true)}>
              <Compass /> Browse societies
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setSwitcherOpen(true)}>
              <Search /> Jump to…
              <span className="ml-auto text-[12px] opacity-70 pointer-coarse:hidden">
                {MOD_KEY} K
              </span>
            </DropdownMenuItem>
            {me.role === 'admin' && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate('/admin')}>
                  <LayoutDashboard /> Admin console
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip content="New message" side="bottom">
          <button
            type="button"
            aria-label="New message"
            onClick={() => setNewMessageOpen(true)}
            className="ml-auto flex size-8 shrink-0 items-center justify-center rounded-md bg-white/10 text-white hover:bg-white/15"
          >
            <SquarePen className="size-4" aria-hidden />
          </button>
        </Tooltip>
      </header>

      <div className="px-2.5 pt-2.5 pb-1">
        <button
          type="button"
          onClick={() => setSwitcherOpen(true)}
          className="flex h-8 w-full items-center gap-2 rounded-md border border-sidebar-border bg-white/[0.04] px-2.5 text-[13.5px] text-sidebar-muted hover:bg-white/[0.08] hover:text-sidebar-foreground"
        >
          <Search className="size-[15px]" aria-hidden />
          Jump to…
          <Kbd className="ml-auto text-sidebar-muted pointer-coarse:hidden">{MOD_KEY} K</Kbd>
        </button>
      </div>

      <nav aria-label="Conversations" className="scrollbar-dark flex-1 overflow-y-auto pt-1 pb-4">
        {isPending ? (
          <div className="space-y-2.5 px-4 pt-3">
            {Array.from({ length: 9 }, (_, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
                key={i}
                className="h-3 animate-pulse rounded bg-white/10"
                style={{ width: `${55 + ((i * 17) % 40)}%` }}
              />
            ))}
          </div>
        ) : isError ? (
          <div className="px-4 pt-3 text-[13px]">
            <p className="text-sidebar-foreground">Couldn’t load your conversations.</p>
            <button
              type="button"
              className="mt-1 font-semibold text-white underline"
              onClick={() => void refetch()}
            >
              Try again
            </button>
          </div>
        ) : (
          SIDEBAR_SECTIONS.map((section) => {
            const all = (groups ?? []).filter((g) => section.types.includes(g.type));
            const isDirect = section.types.includes('DIRECT');
            const isSocieties = section.types.includes('SOCIETY');
            if (!all.length && !isDirect && !isSocieties) return null;
            const isCollapsed = !!collapsed[section.title];
            // Collapsed sections still surface unread conversations and the open one.
            const visible = isCollapsed
              ? all.filter((g) => g.unread > 0 || g.id === activeGroupId)
              : all;
            return (
              <section key={section.title} className="mt-2.5 first:mt-1">
                <h2>
                  <button
                    type="button"
                    aria-expanded={!isCollapsed}
                    onClick={() => toggle(section.title)}
                    className="flex h-7 w-full items-center gap-1 px-3 text-[13.5px] font-semibold text-sidebar-muted hover:text-sidebar-foreground"
                  >
                    <ChevronDown
                      className={cn('size-3.5 transition-transform', isCollapsed && '-rotate-90')}
                      aria-hidden
                    />
                    {section.title}
                  </button>
                </h2>
                <ul className="space-y-px">
                  {visible.map((group) => (
                    <SidebarItem key={group.id} group={group} active={group.id === activeGroupId} />
                  ))}
                  {!isCollapsed && isSocieties && (
                    <ActionRow
                      icon={Compass}
                      label="Browse societies"
                      onClick={() => setDiscoverOpen(true)}
                    />
                  )}
                  {!isCollapsed && isDirect && (
                    <ActionRow
                      icon={Plus}
                      label="New message"
                      onClick={() => setNewMessageOpen(true)}
                    />
                  )}
                </ul>
              </section>
            );
          })
        )}
      </nav>

      <div className="md:hidden">
        <UserMenu variant="sidebar" />
      </div>
    </aside>
  );
}
