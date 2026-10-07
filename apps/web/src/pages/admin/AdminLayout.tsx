import { ArrowLeft, Building2, LayoutDashboard, ScrollText, Shapes, Users } from 'lucide-react';
import { Suspense } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { Spinner } from '@/components/feedback';
import { Avatar } from '@/components/people';
import { useCurrentUser } from '@/hooks/queries';
import { cn } from '@/lib/utils';

const TABS = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/structure', label: 'Structure', icon: Building2 },
  { to: '/admin/groups', label: 'Groups', icon: Shapes },
  { to: '/admin/audit', label: 'Audit log', icon: ScrollText },
];

export default function AdminLayout() {
  const me = useCurrentUser();
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b bg-surface">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 pt-3 sm:px-6">
          <Link
            to="/chat"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Chat
          </Link>
          <div className="flex items-center gap-2.5">
            <img src="/favicon.svg" alt="" className="size-7 rounded-lg" />
            <div>
              <p className="text-sm leading-tight font-semibold">Admin console</p>
              <p className="text-[11px] text-muted-foreground">CUI Connect · IT Services</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="hidden text-muted-foreground sm:inline">{me.name}</span>
            <Avatar name={me.name} size="sm" />
          </div>
        </div>
        <nav
          className="scrollbar-thin mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6"
          aria-label="Admin sections"
        >
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors',
                  isActive
                    ? 'border-primary font-medium text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )
              }
            >
              <Icon className="size-4" aria-hidden /> {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="scrollbar-thin flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <Suspense
            fallback={
              <div className="flex justify-center py-20">
                <Spinner />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
