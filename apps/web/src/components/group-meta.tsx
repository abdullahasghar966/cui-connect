import type { GroupType } from '@cui/shared';
import {
  BookOpen,
  Building2,
  Coffee,
  Hash,
  Landmark,
  type LucideIcon,
  Megaphone,
  MessageCircle,
  Trophy,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const META: Record<GroupType, { icon: LucideIcon; tint: string }> = {
  CAMPUS_ANNOUNCEMENT: {
    icon: Megaphone,
    tint: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  },
  DEPARTMENT_ANNOUNCEMENT: {
    icon: Building2,
    tint: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300',
  },
  FACULTY_LOUNGE: { icon: Coffee, tint: 'bg-orange-500/15 text-orange-700 dark:text-orange-300' },
  SECTION: { icon: Users, tint: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  COURSE: { icon: BookOpen, tint: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  CR_COUNCIL: { icon: Landmark, tint: 'bg-violet-500/15 text-violet-700 dark:text-violet-300' },
  SOCIETY: { icon: Trophy, tint: 'bg-pink-500/15 text-pink-700 dark:text-pink-300' },
  CUSTOM: { icon: Hash, tint: 'bg-slate-500/15 text-slate-700 dark:text-slate-300' },
  DIRECT: { icon: MessageCircle, tint: 'bg-primary-soft text-primary' },
};

export function GroupIcon({
  type,
  size = 'md',
  className,
}: {
  type: GroupType;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const { icon: Icon, tint } = META[type];
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl',
        size === 'sm'
          ? 'size-7 [&_svg]:size-3.5'
          : size === 'lg'
            ? 'size-11 [&_svg]:size-5'
            : 'size-9 [&_svg]:size-4',
        tint,
        className,
      )}
    >
      <Icon />
    </span>
  );
}

export const SIDEBAR_SECTIONS: { title: string; types: GroupType[] }[] = [
  { title: 'Announcements', types: ['CAMPUS_ANNOUNCEMENT', 'DEPARTMENT_ANNOUNCEMENT'] },
  { title: 'Courses', types: ['COURSE'] },
  { title: 'Class & department', types: ['SECTION', 'FACULTY_LOUNGE', 'CR_COUNCIL'] },
  { title: 'Societies & groups', types: ['SOCIETY', 'CUSTOM'] },
  { title: 'Direct messages', types: ['DIRECT'] },
];
