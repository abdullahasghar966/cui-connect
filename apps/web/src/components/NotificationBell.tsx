import { Bell } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useState } from 'react';
import { Link } from 'react-router';
import { NotificationList } from '@/components/NotificationList';
import { Tooltip } from '@/components/ui/menu';
import { useMarkNotifications, useUnreadNotifications } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

/** The 🔔 in the workspace rail: unread count, and a panel with the latest notifications. */
export function NotificationBell() {
  const unread = useUnreadNotifications();
  const mark = useMarkNotifications();
  const [open, setOpen] = useState(false);
  const label = unread ? `Notifications (${unread} unread)` : 'Notifications';

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Tooltip content="Notifications" side="right">
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={label}
            className={cn(
              'relative flex size-9 items-center justify-center rounded-lg transition-colors',
              open
                ? 'bg-white/[0.16] text-white'
                : 'text-sidebar-muted hover:bg-white/10 hover:text-white',
            )}
          >
            <Bell className="size-[19px]" strokeWidth={2} aria-hidden />
            {!!unread && (
              <span className="absolute -top-1.5 -right-2 min-w-[18px] rounded-full border-2 border-rail bg-new px-1 text-center text-[10px] leading-[14px] font-bold text-white">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="end"
          sideOffset={10}
          collisionPadding={12}
          className="animate-in z-50 flex max-h-[min(560px,85vh)] w-[380px] flex-col overflow-hidden rounded-xl border bg-surface shadow-[0_16px_48px_rgb(0_0_0/0.22)]"
        >
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <h2 className="text-[15px] font-bold">Notifications</h2>
            {!!unread && (
              <button
                type="button"
                onClick={() => mark.mutate('all')}
                className="text-[13px] font-semibold text-link hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            <NotificationList limit={20} onNavigate={() => setOpen(false)} />
          </div>
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="border-t px-4 py-2.5 text-center text-[13px] font-semibold text-link hover:bg-surface-2"
          >
            See all notifications
          </Link>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
