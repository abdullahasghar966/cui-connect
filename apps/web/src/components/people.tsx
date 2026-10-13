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
  xs: 'size-5 rounded-[4px] text-[10.5px]',
  sm: 'size-7 rounded-md text-[11px]',
  md: 'size-9 rounded-md text-[13px]',
  lg: 'size-10 rounded-lg text-[14px]',
  xl: 'size-14 rounded-xl text-[19px]',
  '2xl': 'size-32 rounded-2xl text-[40px]',
} as const;

const DOTS = {
  xs: 'size-2 border-[1.5px]',
  sm: 'size-2.5 border-2',
  md: 'size-3 border-2',
  lg: 'size-3 border-2',
  xl: 'size-3.5 border-2',
  '2xl': 'size-5 border-[3px]',
} as const;

const RINGS = {
  surface: 'border-surface',
  sidebar: 'border-sidebar',
  active: 'border-sidebar-active',
  rail: 'border-rail',
} as const;

/** The person's photo, or their initials on a muted, per-person colour (stable across sessions). */
export function Avatar({
  name,
  photo,
  size = 'md',
  online,
  ring = 'surface',
  className,
}: {
  name: string;
  /** Profile photo URL; initials are shown without one. */
  photo?: string | null;
  size?: keyof typeof SIZES;
  online?: boolean;
  /** Background the presence dot sits on, so its cut-out ring blends in. */
  ring?: keyof typeof RINGS;
  className?: string;
}) {
  const hue = hueFor(name);
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      {photo ? (
        <img
          src={photo}
          alt=""
          aria-hidden
          loading="lazy"
          className={cn('bg-muted object-cover', SIZES[size])}
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            'inline-flex items-center justify-center font-bold text-white select-none',
            SIZES[size],
          )}
          style={{ backgroundColor: `hsl(${hue} 30% 42%)` }}
        >
          {/* Two letters don't fit legibly at 20px. */}
          {size === 'xs' ? initials(name).slice(0, 1) : initials(name)}
        </span>
      )}
      {online !== undefined && (
        <span
          aria-hidden
          className={cn(
            'absolute -right-0.5 -bottom-0.5 rounded-full',
            DOTS[size],
            RINGS[ring],
            online ? 'bg-online' : ring === 'surface' ? 'bg-border-strong' : 'bg-sidebar-muted',
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

/** Quiet role tag next to names (plain students get none, to reduce noise). */
export function RoleBadge({ person, showStudent }: { person: PersonLike; showStudent?: boolean }) {
  if (person.role === 'student' && !person.isCR && !showStudent) return null;
  return (
    <Badge tone={person.role === 'faculty' ? 'primary' : 'neutral'}>{roleLabel(person)}</Badge>
  );
}
