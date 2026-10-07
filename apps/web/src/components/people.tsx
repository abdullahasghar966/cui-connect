import { OFFICE_LABELS, type Office, type Role } from '@cui/shared';
import { Badge } from '@/components/ui/badge';
import { cn, hueFor, initials } from '@/lib/utils';

interface PersonLike {
  name: string;
  role: Role;
  isHOD?: boolean;
  isCR?: boolean;
  office?: Office | null;
}

const SIZES = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-9 text-[13px]',
  lg: 'size-11 text-sm',
} as const;

export function Avatar({
  name,
  size = 'md',
  online,
  className,
}: {
  name: string;
  size?: keyof typeof SIZES;
  online?: boolean;
  className?: string;
}) {
  const hue = hueFor(name);
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <span
        aria-hidden
        className={cn(
          'inline-flex items-center justify-center rounded-full font-semibold select-none',
          SIZES[size],
        )}
        style={{
          backgroundColor: `hsl(${hue} 70% 92%)`,
          color: `hsl(${hue} 55% 32%)`,
        }}
      >
        {initials(name)}
      </span>
      {online !== undefined && (
        <span
          role="img"
          aria-label={online ? 'Online' : 'Offline'}
          className={cn(
            'absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-surface',
            online ? 'bg-success' : 'bg-muted-foreground/40',
          )}
        />
      )}
    </span>
  );
}

export function roleLabel(person: PersonLike): string {
  switch (person.role) {
    case 'admin':
      return 'IT Admin';
    case 'staff':
      return person.office ? OFFICE_LABELS[person.office] : 'Staff';
    case 'faculty':
      return person.isHOD ? 'HOD' : 'Faculty';
    case 'student':
      return person.isCR ? 'CR' : 'Student';
  }
}

/** Compact role marker shown next to names (plain students get none to reduce noise). */
export function RoleBadge({ person, showStudent }: { person: PersonLike; showStudent?: boolean }) {
  if (person.role === 'student' && !person.isCR && !showStudent) return null;
  const tone =
    person.role === 'admin'
      ? 'danger'
      : person.role === 'staff'
        ? 'warning'
        : person.role === 'faculty'
          ? 'primary'
          : person.isCR
            ? 'success'
            : 'neutral';
  return <Badge tone={tone}>{roleLabel(person)}</Badge>;
}
