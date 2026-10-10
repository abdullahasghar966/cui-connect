import { campusClock } from '@cui/shared';
import {
  ArrowRight,
  Bell,
  LayoutDashboard,
  type LucideIcon,
  MessagesSquare,
  PartyPopper,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/feedback';
import { GroupIcon } from '@/components/group-meta';
import { NotificationList } from '@/components/NotificationList';
import { describeUser } from '@/components/UserMenu';
import { useCurrentTerm, useStudentSemester } from '@/hooks/academics';
import { useCurrentUser, useGroups } from '@/hooks/queries';
import { formatListTime } from '@/lib/utils';

const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Asia/Karachi',
});

function greeting(): string {
  const hour = Math.floor(campusClock().minutes / 60);
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** First name for the greeting, skipping titles like "Dr." */
function firstName(name: string): string {
  const words = name.split(/\s+/).filter((w) => !/^(dr|mr|ms|mrs|prof|engr)\.?$/i.test(w));
  return words[0] ?? name;
}

export function HomeCard({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: LucideIcon;
  action?: { to: string; label: string };
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-surface">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <Icon className="size-4 text-primary" aria-hidden />
        <h2 className="text-[15px] font-bold">{title}</h2>
        {action && (
          <Link
            to={action.to}
            className="ml-auto inline-flex items-center gap-1 text-[13px] font-semibold text-link hover:underline"
          >
            {action.label} <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        )}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

function UnreadChats() {
  const { data: groups } = useGroups();
  const unread = (groups ?? [])
    .filter((g) => g.unread > 0)
    .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''))
    .slice(0, 5);
  if (!unread.length) {
    return (
      <EmptyState icon={PartyPopper} title="You're all caught up" className="py-6">
        New messages from your classes and offices show up here.
      </EmptyState>
    );
  }
  return (
    <ul className="divide-y">
      {unread.map((g) => (
        <li key={g.id}>
          <Link
            to={`/chat/${g.id}`}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2"
          >
            <GroupIcon type={g.type} className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold">
                {g.type === 'DIRECT' ? (g.peer?.name ?? 'Direct message') : g.name}
              </span>
              {g.lastMessage && (
                <span className="block truncate text-[12.5px] text-muted-foreground">
                  {firstName(g.lastMessage.sender.name)}: {g.lastMessage.body}
                </span>
              )}
            </span>
            <span className="text-[12px] text-muted-foreground">
              {formatListTime(g.lastMessageAt)}
            </span>
            <span className="rounded-full bg-new px-1.5 text-[11px] leading-[18px] font-bold text-white">
              {g.unread}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function HomePage() {
  const me = useCurrentUser();
  const term = useCurrentTerm();
  const semester = useStudentSemester(me);
  const subtitle = [
    dateFormat.format(new Date()),
    term?.name,
    semester ? `Semester ${semester}` : null,
    describeUser(me),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <main className="scrollbar-thin min-w-0 flex-1 overflow-y-auto bg-background">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6">
          <h1 className="text-[26px] leading-tight font-bold tracking-tight">
            {greeting()}, {firstName(me.name)}
          </h1>
          <p className="mt-1 text-[14px] text-muted-foreground">{subtitle}</p>
        </header>

        <div className="grid items-start gap-5 lg:grid-cols-2">
          <HomeCard
            title="Unread chats"
            icon={MessagesSquare}
            action={{ to: '/chat', label: 'All chats' }}
          >
            <UnreadChats />
          </HomeCard>
          <HomeCard
            title="Notifications"
            icon={Bell}
            action={{ to: '/notifications', label: 'See all' }}
          >
            <NotificationList limit={5} />
          </HomeCard>
          {me.role === 'admin' && (
            <HomeCard
              title="Admin console"
              icon={LayoutDashboard}
              action={{ to: '/admin', label: 'Open' }}
            >
              <p className="px-4 py-3 text-[13.5px] text-muted-foreground">
                Manage people, departments, sections, courses, rooms, terms and the rules of every
                group.
              </p>
            </HomeCard>
          )}
        </div>
      </div>
    </main>
  );
}
