import {
  type AuditDTO,
  defaultGroupSettings,
  describePostPolicy,
  GROUP_TYPE_LABELS,
  type GroupType,
} from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { Spinner } from '@/components/feedback';
import { GroupIcon } from '@/components/group-meta';
import { useAdminFeed } from '@/hooks/useAdminFeed';
import { api } from '@/lib/api';
import { formatTime } from '@/lib/utils';
import { Card, PageHeader, Stat, StatStrip, Table } from './ui';

/** Who is in each kind of group: the other half of the boundary model. */
const MEMBERSHIP: Record<Exclude<GroupType, 'DIRECT'>, string> = {
  CAMPUS_ANNOUNCEMENT: 'Everyone (automatic)',
  DEPARTMENT_ANNOUNCEMENT: 'Everyone in the department (automatic)',
  FACULTY_LOUNGE: 'Department faculty only; students can’t be added',
  SECTION: 'Students of the section and the batch advisor (automatic)',
  COURSE: 'Instructor and enrolled students (automatic)',
  CR_COUNCIL: 'Class representatives and the HOD (automatic)',
  SOCIETY: 'Anyone can join',
  CUSTOM: 'Invited by admins or moderators',
};

const DM_RULES: [string, string][] = [
  [
    'Students',
    'Their instructors, batch advisor and HOD; students in their department or a shared group; any office. Not IT admins or unrelated faculty.',
  ],
  ['Faculty', 'Colleagues, admins, offices, and students of their department or that they teach.'],
  ['Offices and admins', 'Anyone on campus.'],
  ['Anyone', 'May reply in a conversation the other person started.'],
];

export default function OverviewPage() {
  const overview = useQuery({ queryKey: ['admin', 'overview'], queryFn: api.admin.overview });
  const [blocked, setBlocked] = useState<AuditDTO[]>([]);
  const onAudit = useCallback((entry: AuditDTO) => {
    if (entry.severity === 'warning') setBlocked((list) => [entry, ...list].slice(0, 8));
  }, []);
  const { stats } = useAdminFeed(onAudit);

  const users = overview.data?.users;
  const totalGroups = overview.data
    ? Object.entries(overview.data.groups)
        .filter(([type]) => type !== 'DIRECT')
        .reduce((sum, [, n]) => sum + (n ?? 0), 0)
    : 0;

  return (
    <>
      <PageHeader
        title="Overview"
        description="Who is on CUI Connect right now, and the communication rules it enforces."
      />
      {overview.isPending ? (
        <Spinner />
      ) : (
        <StatStrip>
          <Stat label="Students" value={users?.student ?? 0} />
          <Stat label="Faculty" value={users?.faculty ?? 0} />
          <Stat label="Staff" value={users?.staff ?? 0} />
          <Stat label="Admins" value={users?.admin ?? 0} />
          <Stat
            label="Groups"
            value={totalGroups}
            hint={`${overview.data?.groups.DIRECT ?? 0} direct chats`}
          />
          <Stat label="Messages" value={overview.data?.messages ?? 0} />
          <Stat label="Online now" value={stats?.onlineUsers ?? overview.data?.online ?? 0} live />
          <Stat
            label="Blocked / min"
            value={stats?.deniedLastMinute ?? 0}
            hint={`Messages: ${stats?.messagesLastMinute ?? 0} / min`}
            live
          />
        </StatStrip>
      )}

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[1.55fr_1fr]">
        <Card
          title="Group rules"
          description="Defaults for every group type. Moderators can lock any group to announcement-only."
        >
          <Table>
            <thead>
              <tr>
                <th>Group type</th>
                <th>Members</th>
                <th>Who can post</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(MEMBERSHIP) as Exclude<GroupType, 'DIRECT'>[]).map((type) => (
                <tr key={type}>
                  <td className="whitespace-nowrap">
                    <span className="flex items-center gap-2 font-semibold">
                      <GroupIcon type={type} className="size-3.5 text-muted-foreground" />
                      {GROUP_TYPE_LABELS[type]}
                    </span>
                  </td>
                  <td className="text-muted-foreground">{MEMBERSHIP[type]}</td>
                  <td>{describePostPolicy({ type, settings: defaultGroupSettings(type) })}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <div className="space-y-6">
          <Card
            title="Blocked attempts"
            description="Attempts to cross a boundary, as they happen."
            actions={
              <Link
                to="/admin/audit"
                className="text-[13px] font-semibold text-link hover:underline"
              >
                Audit log
              </Link>
            }
          >
            {blocked.length === 0 ? (
              <p className="px-4 py-6 text-[13.5px] text-muted-foreground">
                Nothing blocked since you opened this page.
              </p>
            ) : (
              <ul className="divide-y">
                {blocked.map((entry) => (
                  <li key={entry.id} className="animate-in flex gap-2.5 px-4 py-2.5 text-[13.5px]">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                    <span className="min-w-0 flex-1">{entry.summary}</span>
                    <span className="shrink-0 text-[12px] text-muted-foreground">
                      {formatTime(entry.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card
            title="Direct-message rules"
            description="Checked on the server for every new conversation and message."
          >
            <Table>
              <tbody>
                {DM_RULES.map(([who, rule]) => (
                  <tr key={who}>
                    <td className="w-32 align-top font-semibold whitespace-nowrap">{who}</td>
                    <td className="text-muted-foreground">{rule}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
      </div>
    </>
  );
}
