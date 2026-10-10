import { Bell } from 'lucide-react';
import { Link, useLocation, useMatch } from 'react-router';
import { UserMenu } from '@/components/UserMenu';
import { useCurrentUser, useGroups } from '@/hooks/queries';
import { useUnreadNotifications } from '@/hooks/useNotifications';
import { areasFor, isAreaActive } from '@/lib/nav';
import { cn } from '@/lib/utils';

function TabBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="absolute -top-1 left-1/2 ml-1.5 min-w-[16px] rounded-full bg-new px-1 text-center text-[10px] leading-4 font-bold text-white">
      {count > 99 ? '99+' : count}
    </span>
  );
}

/**
 * Bottom navigation on phones (the rail is desktop-only). Hidden inside a conversation, which
 * has its own back button and needs the space for the message box.
 */
export function MobileTabBar() {
  const me = useCurrentUser();
  const { pathname } = useLocation();
  const inConversation = useMatch('/chat/:groupId');
  const { data: groups } = useGroups();
  const unreadChats = groups?.reduce((sum, g) => sum + g.unread, 0) ?? 0;
  const unreadAlerts = useUnreadNotifications();
  if (inConversation) return null;

  // Phones show the first areas; everything else is reachable from Home.
  const areas = areasFor(me)
    .filter((a) => a.to !== '/admin')
    .slice(0, 3);
  const tab = (active: boolean) =>
    cn(
      'relative flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[11px] font-semibold',
      active ? 'text-primary' : 'text-muted-foreground',
    );

  return (
    <nav
      aria-label="Main"
      className="flex shrink-0 border-t bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {areas.map((area) => {
        const { to, label, icon: Icon } = area;
        const active = isAreaActive(area, pathname);
        return (
          <Link key={to} to={to} aria-current={active ? 'page' : undefined} className={tab(active)}>
            <Icon className="size-5" aria-hidden />
            {label}
            {to === '/chat' && <TabBadge count={unreadChats} />}
          </Link>
        );
      })}
      <Link
        to="/notifications"
        aria-label={unreadAlerts ? `Alerts (${unreadAlerts} unread)` : 'Alerts'}
        className={tab(pathname === '/notifications')}
      >
        <Bell className="size-5" aria-hidden />
        Alerts
        <TabBadge count={unreadAlerts} />
      </Link>
      <UserMenu variant="tab" />
    </nav>
  );
}
