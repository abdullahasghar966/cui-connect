import { OFFICE_LABELS, type UserDTO } from '@cui/shared';
import { Check, ChevronsUpDown, LayoutDashboard, LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Avatar } from '@/components/people';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/menu';
import { useCurrentUser } from '@/hooks/queries';
import { useSignOut } from '@/hooks/useSignOut';
import { type ThemePreference, useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { type ConnectionStatus, useRealtime } from '@/state/realtime';

export function describeUser(user: UserDTO): string {
  switch (user.role) {
    case 'student':
      return [user.regNo, user.sectionName].filter(Boolean).join(' · ');
    case 'faculty':
      return [user.isHOD ? 'Head of Department' : user.designation, user.departmentCode]
        .filter(Boolean)
        .join(' · ');
    case 'staff':
      return user.office ? OFFICE_LABELS[user.office] : 'Staff';
    case 'admin':
      return 'IT Services';
  }
}

const THEMES: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'Match system', icon: Monitor },
];

const STATUS_TEXT: Record<ConnectionStatus, string> = {
  connected: 'Active',
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  offline: 'Offline',
};

/** Account menu: shown as the avatar at the bottom of the rail, or as a row on mobile. */
export function UserMenu({ variant }: { variant: 'rail' | 'sidebar' }) {
  const me = useCurrentUser();
  const navigate = useNavigate();
  const signOut = useSignOut();
  const { preference, setPreference } = useTheme();
  const status = useRealtime((s) => s.status);
  const connected = status === 'connected';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === 'rail' ? (
          <button
            type="button"
            aria-label="Account menu"
            className="rounded-lg p-0.5 outline-offset-2 transition-opacity hover:opacity-85"
          >
            <Avatar name={me.name} online={connected} ring="rail" />
          </button>
        ) : (
          <button
            type="button"
            className="flex w-full items-center gap-2.5 border-t border-sidebar-border px-3 py-2.5 text-left hover:bg-sidebar-hover"
          >
            <Avatar name={me.name} size="sm" online={connected} ring="sidebar" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold text-white">{me.name}</span>
              <span className="block truncate text-[12px] text-sidebar-muted">
                {describeUser(me)}
              </span>
            </span>
            <ChevronsUpDown className="size-4 text-sidebar-muted" aria-hidden />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={variant === 'rail' ? 'right' : 'top'}
        align={variant === 'rail' ? 'end' : 'start'}
        className="w-64"
      >
        <div className="flex items-center gap-2.5 px-3.5 pt-1.5 pb-2.5">
          <Avatar name={me.name} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-[14.5px] font-bold">{me.name}</p>
            <p className="truncate text-[12.5px] text-muted-foreground">{describeUser(me)}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <span
                aria-hidden
                className={cn('size-2 rounded-full', connected ? 'bg-online' : 'bg-warning')}
              />
              {STATUS_TEXT[status]}
            </p>
          </div>
        </div>
        <DropdownMenuSeparator />
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
          <LogOut /> Sign out of CUI Connect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
