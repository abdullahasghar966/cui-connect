import { LoaderCircle, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span
      role="status"
      className={cn('inline-flex items-center gap-2 text-muted-foreground', className)}
    >
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-2 p-8 text-center', className)}
    >
      <Icon className="size-7 text-muted-foreground/70" strokeWidth={1.75} aria-hidden />
      <div className="max-w-sm">
        <p className="text-[15px] font-semibold">{title}</p>
        {children && <div className="mt-1 text-[13.5px] text-muted-foreground">{children}</div>}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />;
}

/** Keyboard key hint, e.g. <Kbd>Ctrl</Kbd>. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-[18px] items-center rounded border border-current/25 px-1 text-[11px] leading-none font-medium',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
