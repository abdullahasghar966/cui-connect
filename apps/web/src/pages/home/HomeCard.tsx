import { ArrowRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

/** A card on the Home page: title, optional "open" link, content. */
export function HomeCard({
  title,
  icon: Icon,
  action,
  children,
  className,
}: {
  title: string;
  icon: LucideIcon;
  action?: { to: string; label: string };
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-xl border bg-surface',
        className,
      )}
    >
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <Icon className="size-4 text-primary dark:text-link" aria-hidden />
        <h2 className="text-[15px] font-bold">{title}</h2>
        {action && (
          <Link
            to={action.to}
            className="ml-auto inline-flex items-center gap-1 text-[13px] font-semibold text-link hover:underline"
          >
            {action.label} <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        )}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}
