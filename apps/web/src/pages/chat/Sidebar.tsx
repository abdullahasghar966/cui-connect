import { type GroupDTO, OFFICE_LABELS, type UserDTO } from '@cui/shared';
import {
  BellOff,
  Check,
  ChevronsUpDown,
  Compass,
  LayoutDashboard,
  Lock,
  LogOut,
  Monitor,
  Moon,
  Search,
  SquarePen,
  Sun,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { EmptyState, Skeleton } from '@/components/feedback';
import { GroupIcon, SIDEBAR_SECTIONS } from '@/components/group-meta';
import { Avatar } from '@/components/people';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
} from '@/components/ui/menu';
import { useCurrentUser, useGroups } from '@/hooks/queries';
import { useSignOut } from '@/hooks/useSignOut';
import { type ThemePreference, useTheme } from '@/lib/theme';
import { cn, formatListTime } from '@/lib/utils';
import { type ConnectionStatus, useRealtime } from '@/state/realtime';
import { DiscoverDialog, NewMessageDialog } from './dialogs';

export function describeUser(user: UserDTO): string {
  switch (user.role) {
    case 'student':
      return [user.regNo, user.sectionName].filter(Boolean).join(' · ');
    case 'faculty':
      return [user.isHOD ? 'HOD' : user.designation, user.departmentCode]
        .filter(Boolean)
        .join(' · ');
    case 'staff':
      return user.office ? OFFICE_LABELS[user.office] : 'Staff';
    case 'admin':
      return 'IT Services';
  }
}

const STATUS: Record<ConnectionStatus, { label: string; dot: string }> = {
  connected: { label: 'Live', dot: 'bg-success' },
  connecting: { label: 'Connecting…', dot: 'bg-warning animate-pulse' },
  reconnecting: { label: 'Reconnecting…', dot: 'bg-warning animate-pulse' },
  offline: { label: 'Offline', dot: 'bg-danger' },
};

function ConnectionPill() {
  const status = useRealtime((s) => s.status);
  const { label, dot } = STATUS[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
      aria-live="polite"
    >
      <span className={cn('size-1.5 rounded-full', dot)} aria-hidden />
      {label}
    </span>
  );
}

function preview(group: GroupDTO, meId: string, typing: string[]): string {
  if (typing.length)
    return typing.length === 1 ? `${typing[0]} is typing…` : 'Several people are typing…';
  const last = group.lastMessage;
  if (!last) return group.description ?? 'No messages yet';
  if (last.deleted) return 'Message deleted';
  if (last.sender.id === meId) return `You: ${last.body}`;
  if (group.type === 'DIRECT') return last.body;
  return `${last.sender.name.replace(/^(Dr|Mr|Ms|Mrs)\.?\s+/, '').split(' ')[0]}: ${last.body}`;
}

function GroupListItem({
  group,
  active,
  meId,
}: {
  group: GroupDTO;
  active: boolean;
  meId: string;
}) {
  const online = useRealtime((s) => (group.peer ? s.online.has(group.peer.id) : false));
  const typingMap = useRealtime((s) => s.typing[group.id]);
  const typing = typingMap ? Object.values(typingMap).map((t) => t.name) : [];
  const muted = !!group.mutedUntil && new Date(group.mutedUntil) > new Date();

  return (
    <Link
      to={`/chat/${group.id}`}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors',
        active ? 'bg-primary-soft' : 'hover:bg-muted/70',
      )}
    >
      {group.type === 'DIRECT' && group.peer ? (
        <Avatar name={group.peer.name} online={online} />
      ) : (
        <GroupIcon type={group.type} />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              'truncate text-sm',
              group.unread ? 'font-semibold text-foreground' : 'font-medium',
              active && 'text-primary',
            )}
          >
            {group.name}
          </span>
          {group.settings.locked && (
            <Lock className="size-3 shrink-0 text-muted-foreground" aria-label="Locked" />
          )}
          {muted && <BellOff className="size-3 shrink-0 text-warning" aria-label="You are muted" />}
          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
            {formatListTime(group.lastMessageAt)}
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span
            className={cn(
              'truncate text-xs',
              typing.length ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            {preview(group, meId, typing)}
          </span>
          {group.unread > 0 && (
            <span className="ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
              {group.unread >= 99 ? '99+' : group.unread}
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}

const THEMES: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

function UserMenu({ me }: { me: UserDTO }) {
  const navigate = useNavigate();
  const signOut = useSignOut();
  const { preference, setPreference } = useTheme();
  const connected = useRealtime((s) => s.status === 'connected');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 border-t px-4 py-3 text-left transition-colors hover:bg-muted/60"
        >
          <Avatar name={me.name} online={connected} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{me.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{describeUser(me)}</span>
          </span>
          <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        {THEMES.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem key={value} onSelect={() => setPreference(value)}>
            <Icon /> {label}
            {preference === value && <Check className="ml-auto" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {me.role === 'admin' && (
          <DropdownMenuItem onSelect={() => navigate('/admin')}>
            <LayoutDashboard /> Admin console
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => void signOut()} danger>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
  const { data: groups, isPending, isError, refetch } = useGroups();
  const [filter, setFilter] = useState('');
  const [newMessageOpen, setNewMessageOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);

  const sections = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const visible = (groups ?? []).filter((g) => !needle || g.name.toLowerCase().includes(needle));
    return SIDEBAR_SECTIONS.map((section) => ({
      ...section,
      groups: visible.filter((g) => section.types.includes(g.type)),
    })).filter((s) => s.groups.length > 0);
  }, [groups, filter]);

  return (
    <aside className={cn('flex h-full flex-col border-r bg-surface', className)}>
      <header className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <img src="/favicon.svg" alt="" className="size-8 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-tight font-semibold">CUI Connect</p>
          <p className="text-[11px] text-muted-foreground">COMSATS Islamabad</p>
        </div>
        <ConnectionPill />
        <Tooltip content="New message">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="New message"
            onClick={() => setNewMessageOpen(true)}
          >
            <SquarePen />
          </Button>
        </Tooltip>
      </header>

      <div className="flex gap-2 px-3 pb-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
            className="bg-surface-2 pl-8"
          />
        </div>
        <Tooltip content="Discover societies">
          <Button
            variant="outline"
            size="icon"
            aria-label="Discover societies"
            onClick={() => setDiscoverOpen(true)}
          >
            <Compass />
          </Button>
        </Tooltip>
      </div>

      <nav className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-3" aria-label="Conversations">
        {isPending ? (
          <div className="space-y-3 p-2">
            {Array.from({ length: 7 }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-xl" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-2.5 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="p-4 text-sm">
            <p className="text-danger">Couldn't load your conversations.</p>
            <Button variant="link" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : sections.length === 0 ? (
          <EmptyState icon={Search} title="Nothing found" className="py-10">
            No conversation matches “{filter}”.
          </EmptyState>
        ) : (
          sections.map((section) => (
            <section key={section.title} className="mt-3 first:mt-1">
              <h2 className="px-2.5 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {section.title}
              </h2>
              <ul className="space-y-0.5">
                {section.groups.map((group) => (
                  <li key={group.id}>
                    <GroupListItem group={group} active={group.id === activeGroupId} meId={me.id} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </nav>

      <UserMenu me={me} />
      <NewMessageDialog open={newMessageOpen} onOpenChange={setNewMessageOpen} />
      <DiscoverDialog open={discoverOpen} onOpenChange={setDiscoverOpen} />
    </aside>
  );
}
