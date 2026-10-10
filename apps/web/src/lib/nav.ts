import type { UserDTO } from '@cui/shared';
import { House, LayoutDashboard, type LucideIcon, MessagesSquare } from 'lucide-react';

export interface AppArea {
  to: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  /** Path prefixes that belong to this area. */
  matches: string[];
}

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
  ];
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
