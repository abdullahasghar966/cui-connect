import {
  ArrowLeft,
  Building2,
  Hash,
  LayoutDashboard,
  type LucideIcon,
  ScrollText,
  Users,
} from 'lucide-react';
import { Suspense } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { Spinner } from '@/components/feedback';
import { cn } from '@/lib/utils';

const SECTIONS: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/structure', label: 'Structure', icon: Building2 },
  { to: '/admin/groups', label: 'Groups & rules', icon: Hash },
  { to: '/admin/audit', label: 'Audit log', icon: ScrollText },
];

export default function AdminLayout() {
  return (
    <div className="flex h-full min-w-0 flex-1 overflow-hidden">
      <aside className="hidden w-[248px] shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-12 shrink-0 items-center border-b border-sidebar-border px-4">
          <span className="text-[15.5px] font-bold text-white">Admin console</span>
        </div>
        <nav aria-label="Admin sections" className="flex flex-col gap-px px-2 py-3">
          {SECTIONS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[14.5px] transition-colors',
                  isActive
                    ? 'bg-sidebar-active text-white'
                    : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground',
                )
              }
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <p className="mt-auto border-t border-sidebar-border px-4 py-3 text-[12px] text-sidebar-muted">
          Changes here reach people who are online immediately.
        </p>
      </aside>

      <main className="scrollbar-thin min-w-0 flex-1 overflow-y-auto bg-background">
        <div className="sticky top-0 z-10 border-b bg-background md:hidden">
          <div className="flex items-center gap-2 px-4 pt-3">
            <Link
              to="/chat"
              className="inline-flex items-center gap-1 text-[13px] font-semibold text-muted-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden /> Chats
            </Link>
            <span className="ml-auto text-[14px] font-bold">Admin console</span>
          </div>
          <nav aria-label="Admin sections" className="flex gap-1 overflow-x-auto px-3 pt-2">
            {SECTIONS.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'border-b-2 px-2.5 py-2 text-[13.5px] whitespace-nowrap',
                    isActive
                      ? 'border-primary font-semibold text-foreground'
                      : 'border-transparent text-muted-foreground',
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="mx-auto max-w-6xl px-6 py-7">
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
