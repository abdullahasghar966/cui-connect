import { cn } from '@/lib/utils';

/** The CUI Connect mark: a "C" with a message dot. */
export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden
      className={cn('shrink-0', className)}
    >
      <rect width="64" height="64" rx="14" fill="#0E7B58" />
      <path
        d="M43 22.4A14.5 14.5 0 1 0 43 41.6"
        fill="none"
        stroke="#fff"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <circle cx="45" cy="32" r="4.2" fill="#fff" />
    </svg>
  );
}
