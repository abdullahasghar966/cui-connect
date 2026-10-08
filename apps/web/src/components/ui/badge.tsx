import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Small, quiet tags (roles, states). Colour only where it carries meaning. */
const badgeVariants = cva(
  'inline-flex h-[18px] items-center gap-1 rounded-[4px] border px-1.5 text-[11px] font-semibold leading-none whitespace-nowrap [&_svg]:size-3',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-surface-2 text-muted-foreground',
        primary: 'border-primary/25 bg-primary-soft text-primary dark:text-link',
        success: 'border-success/25 bg-primary-soft text-success',
        warning: 'border-warning/25 bg-warning-soft text-warning',
        danger: 'border-danger/25 bg-danger-soft text-danger',
        outline: 'border-border-strong bg-transparent text-muted-foreground',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
