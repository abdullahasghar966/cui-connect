import type { UserDTO } from '@cui/shared';
import {
  GraduationCap,
  House,
  Landmark,
  LayoutDashboard,
  type LucideIcon,
  MessagesSquare,
} from 'lucide-react';

export interface AppArea {
  to: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  /** Path prefixes that belong to this area. */
  matches: string[];
}

/** Teachers (batch advisors) and the offices that receive requests have an inbox. */
export const handlesRequests = (me: Pick<UserDTO, 'role' | 'office'>) =>
  me.role === 'faculty' ||
  (me.role === 'staff' &&
    (me.office === 'EXAM' || me.office === 'STUDENT_AFFAIRS' || me.office === 'DEPARTMENT'));

/** Students use Services; so does everyone who handles their requests. */
export const hasServices = (me: Pick<UserDTO, 'role' | 'office'>) =>
  me.role === 'student' || handlesRequests(me);

/** The top-level areas of the app a person can open, depending on their role. */
export function areasFor(me: UserDTO): AppArea[] {
  const areas: AppArea[] = [
    { to: '/home', label: 'Home', hint: 'Your day at a glance', icon: House, matches: ['/home'] },
    {
      to: '/chat',
      label: 'Chats',
      hint: 'Conversations',
      icon: MessagesSquare,
      matches: ['/chat'],
    },
    {
      to: '/academics',
      label: 'Academics',
      hint: 'Timetable and courses',
      icon: GraduationCap,
      matches: ['/academics'],
    },
  ];
  if (hasServices(me)) {
    areas.push({
      to: '/services',
      label: 'Services',
      hint: 'Requests and complaints',
      icon: Landmark,
      matches: ['/services'],
    });
  }
  if (me.role === 'admin') {
    areas.push({
      to: '/admin',
      label: 'Admin',
      hint: 'Admin console',
      icon: LayoutDashboard,
      matches: ['/admin'],
    });
  }
  return areas;
}

export const isAreaActive = (area: AppArea, pathname: string) =>
  area.matches.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
