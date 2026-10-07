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
import { Card, PageHeader, Stat, Table } from './ui';

/** Who is in each kind of group: the other half of the boundary model. */
const MEMBERSHIP: Record<Exclude<GroupType, 'DIRECT'>, string> = {
  CAMPUS_ANNOUNCEMENT: 'Everyone (automatic)',
  DEPARTMENT_ANNOUNCEMENT: 'Everyone in the department (automatic)',
  FACULTY_LOUNGE: "Department faculty only; students can't be added",
  SECTION: 'Students of the section + batch advisor (automatic)',
  COURSE: 'Instructor + enrolled students (automatic)',
  CR_COUNCIL: 'Class representatives + HOD (automatic)',
  SOCIETY: 'Anyone can join',
  CUSTOM: 'Invited by admins or moderators',
};

const DM_RULES = [
  'Students → their instructors, batch advisor, HOD; classmates & department peers; society members; offices',
  'Students cannot message IT administrators or unrelated faculty directly',
  'Faculty → colleagues, offices, students of their department and students they teach',
  'Offices (staff) and admins → anyone',
  'Anyone may reply in a conversation the other person started',
];

export default function OverviewPage() {
  const overview = useQuery({ queryKey: ['admin', 'overview'], queryFn: api.admin.overview });
  const [blocked, setBlocked] = useState<AuditDTO[]>([]);
  const onAudit = useCallback((entry: AuditDTO) => {
    if (entry.severity === 'warning') setBlocked((list) => [entry, ...list].slice(0, 6));
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
        description="Live picture of CUI Connect and the communication boundaries it enforces."
      />
      {overview.isPending ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <Stat label="Students" value={users?.student ?? 0} />
          <Stat label="Faculty" value={users?.faculty ?? 0} />
          <Stat label="Staff" value={users?.staff ?? 0} />
          <Stat label="Admins" value={users?.admin ?? 0} />
          <Stat
            label="Groups"
            value={totalGroups}
            hint={`${overview.data?.groups.DIRECT ?? 0} DMs`}
          />
          <Stat label="Messages" value={overview.data?.messages ?? 0} />
          <Stat label="Online now" value={stats?.onlineUsers ?? overview.data?.online ?? 0} live />
          <Stat
            label="Blocked / min"
            value={stats?.deniedLastMinute ?? 0}
            hint={`${stats?.messagesLastMinute ?? 0} msgs / min`}
            live
          />
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card
          title="Group boundaries"
          description="Default rules applied to every group type (moderators can lock a group to announcement-only)."
        >
          <Table>
            <thead>
              <tr>
                <th>Group type</th>
                <th>Who is a member</th>
                <th>Who can post</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(MEMBERSHIP) as Exclude<GroupType, 'DIRECT'>[]).map((type) => (
                <tr key={type}>
                  <td>
                    <span className="flex items-center gap-2 font-medium">
                      <GroupIcon type={type} size="sm" /> {GROUP_TYPE_LABELS[type]}
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
            title="Direct-message rules"
            description="Checked on the server for every new conversation and message."
          >
            <ul className="space-y-2 px-5 py-4 text-sm">
              {DM_RULES.map((rule) => (
                <li key={rule} className="flex gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  {rule}
                </li>
              ))}
            </ul>
          </Card>
          <Card
            title="Blocked just now"
            description="Attempts to cross a boundary appear here live."
            actions={
              <Link to="/admin/audit" className="text-xs text-primary hover:underline">
                Full audit log
              </Link>
            }
          >
            {blocked.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                Nothing yet. Try posting as a student in an announcement channel.
              </p>
            ) : (
              <ul className="divide-y">
                {blocked.map((entry) => (
                  <li key={entry.id} className="animate-in flex gap-3 px-5 py-3 text-sm">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                    <span className="min-w-0 flex-1">{entry.summary}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(entry.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
