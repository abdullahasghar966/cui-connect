import type { NotificationDTO, NotificationType } from '@cui/shared';
import {
  AtSign,
  BellOff,
  BookOpen,
  CalendarCheck,
  CalendarClock,
  ClipboardList,
  FileText,
  GraduationCap,
  type LucideIcon,
  Megaphone,
  PartyPopper,
  UserCheck,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { EmptyState, Spinner } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { useMarkNotifications, useNotifications } from '@/hooks/useNotifications';
import { cn, formatListTime } from '@/lib/utils';

export const NOTIFICATION_ICONS: Record<NotificationType, LucideIcon> = {
  timetable: CalendarClock,
  results: GraduationCap,
  exams: ClipboardList,
  attendance: UserCheck,
  coursework: BookOpen,
  mentions: AtSign,
  requests: FileText,
  events: PartyPopper,
  bookings: CalendarCheck,
  system: Megaphone,
};

function NotificationRow({
  notification,
  onOpen,
}: {
  notification: NotificationDTO;
  onOpen: (n: NotificationDTO) => void;
}) {
  const Icon = NOTIFICATION_ICONS[notification.type];
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(notification)}
        className={cn(
          'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2',
          !notification.read && 'bg-primary-soft/50',
        )}
      >
        <span
          className={cn(
            'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg',
            notification.read
              ? 'bg-muted text-muted-foreground'
              : 'bg-primary text-primary-foreground',
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span
              className={cn(
                'min-w-0 flex-1 text-[14px]',
                notification.read ? 'font-medium' : 'font-bold',
              )}
            >
              {notification.title}
            </span>
            <span className="shrink-0 text-[12px] text-muted-foreground">
              {formatListTime(notification.createdAt)}
            </span>
          </span>
          {notification.body && (
            <span className="mt-0.5 block text-[13px] text-muted-foreground">
              {notification.body}
            </span>
          )}
        </span>
        {!notification.read && (
          <span className="mt-2 size-2 shrink-0 rounded-full bg-primary">
            <span className="sr-only">Unread</span>
          </span>
        )}
      </button>
    </li>
  );
}

/** The notification list shared by the bell's panel and the full Notifications page. */
export function NotificationList({
  onNavigate,
  limit,
}: {
  onNavigate?: () => void;
  /** Show at most this many (the bell panel). */
  limit?: number;
}) {
  const navigate = useNavigate();
  const notifications = useNotifications();
  const mark = useMarkNotifications();
  const items = notifications.data?.pages.flatMap((p) => p.notifications) ?? [];
  const shown = limit ? items.slice(0, limit) : items;

  const open = (n: NotificationDTO) => {
    if (!n.read) mark.mutate([n.id]);
    if (n.link) {
      onNavigate?.();
      navigate(n.link);
    }
  };

  if (notifications.isPending) {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }
  if (!items.length) {
    return (
      <EmptyState icon={BellOff} title="No notifications yet">
        Marks, timetable changes, exam seats and mentions will appear here.
      </EmptyState>
    );
  }
  return (
    <>
      <ul className="divide-y" aria-label="Notifications">
        {shown.map((n) => (
          <NotificationRow key={n.id} notification={n} onOpen={open} />
        ))}
      </ul>
      {!limit && notifications.hasNextPage && (
        <div className="flex justify-center border-t p-3">
          <Button
            variant="ghost"
            size="sm"
            loading={notifications.isFetchingNextPage}
            onClick={() => void notifications.fetchNextPage()}
          >
            Show older
          </Button>
        </div>
      )}
    </>
  );
}
