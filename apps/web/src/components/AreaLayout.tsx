import { ArrowLeft, type LucideIcon } from 'lucide-react';
import { type ReactNode, Suspense } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { Spinner } from '@/components/feedback';
import { cn } from '@/lib/utils';

export interface AreaSection {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Match the path exactly (for the area's index page). */
  end?: boolean;
  badge?: number;
}

/**
 * A section of the app (Academics, Admin console…): a dark sidebar on desktop and scrolling
 * tabs on phones, with the pages rendered on the right.
 */
export function AreaLayout({
  title,
  label,
  sections,
  footer,
  wide,
}: {
  title: string;
  /** Accessible name of the section navigation. */
  label: string;
  sections: AreaSection[];
  footer?: ReactNode;
  /** Pages that need more room (timetable grids). */
  wide?: boolean;
}) {
  return (
    <div className="flex h-full min-w-0 flex-1 overflow-hidden">
      <aside className="hidden w-[248px] shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-12 shrink-0 items-center border-b border-sidebar-border px-4">
          <span className="text-[15.5px] font-bold text-white">{title}</span>
        </div>
        <nav aria-label={label} className="flex flex-col gap-px px-2 py-3">
          {sections.map(({ to, label: text, icon: Icon, end, badge }) => (
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
              <span className="min-w-0 flex-1 truncate">{text}</span>
              {!!badge && (
                <span className="rounded-full bg-new px-1.5 text-[11px] leading-[18px] font-bold text-white">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        {footer && (
          <div className="mt-auto border-t border-sidebar-border px-4 py-3 text-[12px] text-sidebar-muted">
            {footer}
          </div>
        )}
      </aside>

      <main className="scrollbar-thin min-w-0 flex-1 overflow-y-auto bg-background">
        <div className="sticky top-0 z-10 border-b bg-background md:hidden">
          <div className="flex items-center gap-2 px-4 pt-3">
            <Link
              to="/home"
              className="inline-flex items-center gap-1 text-[13px] font-semibold text-muted-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden /> Home
            </Link>
            <span className="ml-auto text-[14px] font-bold">{title}</span>
          </div>
          <nav aria-label={label} className="flex gap-1 overflow-x-auto px-3 pt-2">
            {sections.map(({ to, label: text, end }) => (
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
                {text}
              </NavLink>
            ))}
          </nav>
        </div>
        <div
          className={cn('mx-auto px-4 py-6 sm:px-6 sm:py-7', wide ? 'max-w-[1400px]' : 'max-w-6xl')}
        >
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
