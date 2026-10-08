import type { GroupSettings, GroupType } from '@cui/shared';
import { Hash, Lock, type LucideIcon, Megaphone, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Groups that only selected people can see (shown with a lock, like private channels). */
export function isPrivateGroup(type: GroupType, settings?: Pick<GroupSettings, 'joinPolicy'>) {
  if (type === 'FACULTY_LOUNGE' || type === 'CR_COUNCIL') return true;
  return type === 'CUSTOM' && settings?.joinPolicy !== 'open';
}

function glyphFor(type: GroupType, settings?: Pick<GroupSettings, 'joinPolicy'>): LucideIcon {
  if (type === 'CAMPUS_ANNOUNCEMENT' || type === 'DEPARTMENT_ANNOUNCEMENT') return Megaphone;
  if (type === 'DIRECT') return MessageCircle;
  return isPrivateGroup(type, settings) ? Lock : Hash;
}

/** Monochrome channel glyph: # public, lock private, megaphone announcement. */
export function GroupIcon({
  type,
  settings,
  className,
}: {
  type: GroupType;
  settings?: Pick<GroupSettings, 'joinPolicy'>;
  /** Kept for API compatibility with older call sites. */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const Icon = glyphFor(type, settings);
  return <Icon aria-hidden strokeWidth={2.25} className={cn('size-4 shrink-0', className)} />;
}

export const SIDEBAR_SECTIONS: { title: string; types: GroupType[] }[] = [
  { title: 'Announcements', types: ['CAMPUS_ANNOUNCEMENT', 'DEPARTMENT_ANNOUNCEMENT'] },
  { title: 'Courses', types: ['COURSE'] },
  { title: 'Class & department', types: ['SECTION', 'FACULTY_LOUNGE', 'CR_COUNCIL'] },
  { title: 'Societies & groups', types: ['SOCIETY', 'CUSTOM'] },
  { title: 'Direct messages', types: ['DIRECT'] },
];
