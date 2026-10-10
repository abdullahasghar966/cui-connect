import { Link, useLocation } from 'react-router';
import { Logo } from '@/components/Logo';
import { NotificationBell } from '@/components/NotificationBell';
import { UserMenu } from '@/components/UserMenu';
import { Tooltip } from '@/components/ui/menu';
import { useCurrentUser, useGroups } from '@/hooks/queries';
import { areasFor, isAreaActive } from '@/lib/nav';
import { cn } from '@/lib/utils';

/** Narrow workspace bar on the far left (desktop): areas of the app, notifications, account. */
export function AppRail() {
  const me = useCurrentUser();
  const { pathname } = useLocation();
  const { data: groups } = useGroups();
  const unread = groups?.reduce((sum, g) => sum + g.unread, 0) ?? 0;

  return (
    <nav
      aria-label="Workspace"
      className="hidden w-[68px] shrink-0 flex-col items-center bg-rail pt-3 pb-4 md:flex"
    >
      <Link to="/home" aria-label="CUI Connect home" className="mb-4 rounded-[10px]">
        <Logo size={36} />
      </Link>
      <div className="flex flex-col items-center gap-2">
        {areasFor(me).map((area) => {
          const { to, label, hint, icon: Icon } = area;
          const active = isAreaActive(area, pathname);
          const badge = to === '/chat' ? unread : 0;
          return (
            <Tooltip key={to} content={hint} side="right">
              <Link
                to={to}
                aria-current={active ? 'page' : undefined}
                className="group flex w-14 flex-col items-center gap-1 rounded-lg py-0.5"
              >
                <span
                  className={cn(
                    'relative flex size-9 items-center justify-center rounded-lg transition-colors',
                    active
                      ? 'bg-white/[0.16] text-white'
                      : 'text-sidebar-muted group-hover:bg-white/10 group-hover:text-white',
                  )}
                >
                  <Icon className="size-[19px]" strokeWidth={2} aria-hidden />
                  {!!badge && (
                    <span className="absolute -top-1.5 -right-2 min-w-[18px] rounded-full border-2 border-rail bg-new px-1 text-center text-[10px] leading-[14px] font-bold text-white">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    'text-[11px] font-semibold',
                    active ? 'text-white' : 'text-sidebar-muted group-hover:text-white',
                  )}
                >
                  {label}
                </span>
              </Link>
            </Tooltip>
          );
        })}
      </div>
      <div className="mt-auto flex flex-col items-center gap-4">
        <NotificationBell />
        <UserMenu variant="rail" />
      </div>
    </nav>
  );
}
