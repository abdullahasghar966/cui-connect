import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[24px] leading-tight font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-[14px] text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('overflow-hidden rounded-lg border bg-surface', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            {title && <h2 className="text-[15px] font-bold">{title}</h2>}
            {description && (
              <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
            )}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full text-left text-[13.5px] [&_tbody_tr]:border-t [&_tbody_tr:hover]:bg-surface-2 [&_td]:px-4 [&_td]:py-2.5 [&_th]:h-9 [&_th]:px-4 [&_th]:text-[12px] [&_th]:font-semibold [&_th]:text-muted-foreground [&_thead]:bg-surface-2">
        {children}
      </table>
    </div>
  );
}

/** A single bordered strip of key numbers (instead of a grid of separate cards). */
export function StatStrip({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4 xl:grid-cols-8">
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  live,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  live?: boolean;
}) {
  return (
    <div className="bg-surface px-4 py-3">
      <p className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
        {live && <span className="size-1.5 rounded-full bg-online" aria-hidden />}
        {label}
      </p>
      <p className="mt-1 text-[22px] leading-tight font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-[12px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
