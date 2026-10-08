import {
  type AdminGroupDTO,
  createGroupSchema,
  defaultGroupSettings,
  describePostPolicy,
  GROUP_TYPE_LABELS,
  GROUP_TYPES,
  type GroupSettings,
  type GroupType,
  type JoinPolicy,
  type MemberRole,
  type PostPolicy,
  ROLE_LABELS,
  ROLES,
  type Role,
} from '@cui/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Plus, Save, Search, Shapes, UserMinus, UserPlus } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, Spinner } from '@/components/feedback';
import { GroupIcon } from '@/components/group-meta';
import { Avatar, RoleBadge } from '@/components/people';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { useMembers } from '@/hooks/queries';
import { useDebounced } from '@/hooks/useDebounced';
import { ApiError, api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { cn } from '@/lib/utils';
import { Card, PageHeader, Table } from './ui';

const errorMessage = (err: unknown) =>
  err instanceof ApiError ? err.message : 'Something went wrong';

const POST_POLICY_LABELS: Record<PostPolicy, string> = {
  all: 'All members',
  moderators: 'Moderators only (announcement channel)',
  roles: 'Only selected roles (and moderators)',
};

const JOIN_POLICY_LABELS: Record<JoinPolicy, string> = {
  auto: 'Automatic (from university records)',
  open: 'Open: anyone eligible can join',
  invite: 'Invite only',
};

function RoleChecks({
  value,
  onChange,
  label,
}: {
  value: Role[];
  onChange: (roles: Role[]) => void;
  label: string;
}) {
  return (
    <fieldset>
      <legend className="text-xs font-medium text-muted-foreground">{label}</legend>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {ROLES.map((role) => (
          <Checkbox
            key={role}
            label={ROLE_LABELS[role]}
            checked={value.includes(role)}
            onChange={(e) =>
              onChange(e.target.checked ? [...value, role] : value.filter((r) => r !== role))
            }
          />
        ))}
      </div>
    </fieldset>
  );
}

function SettingsEditor({
  settings,
  onChange,
  system,
}: {
  settings: GroupSettings;
  onChange: (s: GroupSettings) => void;
  system: boolean;
}) {
  return (
    <div className="space-y-4">
      <Field label="Who can post" htmlFor="postPolicy">
        <Select
          id="postPolicy"
          value={settings.postPolicy}
          onChange={(e) => onChange({ ...settings, postPolicy: e.target.value as PostPolicy })}
        >
          {(Object.keys(POST_POLICY_LABELS) as PostPolicy[]).map((p) => (
            <option key={p} value={p}>
              {POST_POLICY_LABELS[p]}
            </option>
          ))}
        </Select>
      </Field>
      {settings.postPolicy === 'roles' && (
        <RoleChecks
          label="Roles allowed to post"
          value={settings.allowedPosterRoles}
          onChange={(allowedPosterRoles) => onChange({ ...settings, allowedPosterRoles })}
        />
      )}
      {!system && (
        <>
          <RoleChecks
            label="Who may be a member (none selected = anyone)"
            value={settings.eligibleRoles}
            onChange={(eligibleRoles) => onChange({ ...settings, eligibleRoles })}
          />
          <Field label="How people join" htmlFor="joinPolicy">
            <Select
              id="joinPolicy"
              value={settings.joinPolicy}
              onChange={(e) => onChange({ ...settings, joinPolicy: e.target.value as JoinPolicy })}
            >
              <option value="open">{JOIN_POLICY_LABELS.open}</option>
              <option value="invite">{JOIN_POLICY_LABELS.invite}</option>
            </Select>
          </Field>
        </>
      )}
      <Checkbox
        label="Locked: temporarily only moderators can post"
        checked={settings.locked}
        onChange={(e) => onChange({ ...settings, locked: e.target.checked })}
      />
    </div>
  );
}

function AddMember({ groupId }: { groupId: string }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const search = useDebounced(q);
  const results = useQuery({
    queryKey: ['admin', 'users', 'picker', search],
    queryFn: () => api.admin.users({ q: search }),
    enabled: search.length >= 2,
  });
  const add = useMutation({
    mutationFn: (userId: string) => api.addMember(groupId, { userId, role: 'member' }),
    onSuccess: (member) => {
      toast.success(`${member.user.name} added. They see the group instantly.`);
      setQ('');
      void qc.invalidateQueries({ queryKey: keys.members(groupId) });
      void qc.invalidateQueries({ queryKey: ['admin', 'groups'] });
    },
    // The server explains membership boundaries, e.g. "The faculty lounge is only for…"
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Add someone: type a name or reg. no."
        aria-label="Find a person to add"
        className="pl-8"
      />
      {search.length >= 2 && results.data && (
        <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-xl border bg-surface p-1 shadow-xl">
          {results.data.slice(0, 8).map((user) => (
            <li key={user.id}>
              <button
                type="button"
                onClick={() => add.mutate(user.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <Avatar name={user.name} size="xs" />
                <span className="truncate">{user.name}</span>
                <RoleBadge person={user} showStudent />
                <UserPlus className="ml-auto size-4 text-muted-foreground" aria-hidden />
              </button>
            </li>
          ))}
          {results.data.length === 0 && (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">No matches</li>
          )}
        </ul>
      )}
    </div>
  );
}

function ManageGroup({ group }: { group: AdminGroupDTO }) {
  const qc = useQueryClient();
  const [settings, setSettings] = useState<GroupSettings>(group.settings);
  const members = useMembers(group.id);
  useEffect(() => setSettings(group.settings), [group.settings]);

  const save = useMutation({
    mutationFn: () => api.updateGroup(group.id, { settings }),
    onSuccess: () => {
      toast.success('Settings saved. Members see the new rules immediately.');
      void qc.invalidateQueries({ queryKey: ['admin', 'groups'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (userId: string) => api.removeMember(group.id, userId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.members(group.id) });
      void qc.invalidateQueries({ queryKey: ['admin', 'groups'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const setRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: MemberRole }) =>
      api.setMemberRole(group.id, userId, role),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.members(group.id) }),
    onError: (err) => toast.error(errorMessage(err)),
  });

  const dirty = JSON.stringify(settings) !== JSON.stringify(group.settings);

  return (
    <Card
      title={group.name}
      description={`${GROUP_TYPE_LABELS[group.type]}${group.system ? ' · provisioned from university records' : ''}`}
      className="lg:sticky lg:top-0"
    >
      <div className="space-y-4 border-b p-5">
        <SettingsEditor settings={settings} onChange={setSettings} system={group.system} />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {describePostPolicy({ type: group.type, settings })}
          </p>
          <Button
            size="sm"
            disabled={!dirty}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            <Save /> Save
          </Button>
        </div>
      </div>
      <div className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            Members · {members.data?.length ?? group.memberCount}
          </h3>
        </div>
        <AddMember groupId={group.id} />
        {members.isPending ? (
          <div className="py-4">
            <Spinner />
          </div>
        ) : (
          <ul className="mt-3 max-h-[28rem] divide-y overflow-y-auto">
            {members.data?.map((m) => (
              <li key={m.user.id} className="flex items-center gap-2.5 py-2">
                <Avatar name={m.user.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm">
                    <span className="truncate font-medium">{m.user.name}</span>
                    <RoleBadge person={m.user} />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {m.source === 'auto' ? 'From university records' : 'Added manually'}
                  </span>
                </span>
                {m.source === 'manual' ? (
                  <>
                    <Select
                      aria-label={`Role of ${m.user.name}`}
                      value={m.role}
                      onChange={(e) =>
                        setRole.mutate({ userId: m.user.id, role: e.target.value as MemberRole })
                      }
                      className="h-8 w-32"
                    >
                      <option value="member">Member</option>
                      <option value="moderator">Moderator</option>
                      <option value="owner">Owner</option>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${m.user.name}`}
                      onClick={() => remove.mutate(m.user.id)}
                    >
                      <UserMinus />
                    </Button>
                  </>
                ) : (
                  <Badge tone={m.role === 'member' ? 'neutral' : 'primary'}>
                    {m.role === 'owner' ? 'Owner' : m.role === 'moderator' ? 'Moderator' : 'Member'}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function CreateGroupDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'SOCIETY' | 'CUSTOM'>('CUSTOM');
  const [settings, setSettings] = useState<GroupSettings>(defaultGroupSettings('CUSTOM'));
  const create = useMutation({
    mutationFn: api.admin.createGroup,
    onSuccess: ({ id }) => {
      toast.success(`${name} created`);
      void qc.invalidateQueries({ queryKey: ['admin', 'groups'] });
      onOpenChange(false);
      onCreated(id);
      setName('');
      setDescription('');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = createGroupSchema.safeParse({
      name,
      description: description || undefined,
      type,
      settings,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Check the form');
      return;
    }
    create.mutate(parsed.data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        wide
        title="New group"
        description="Official groups (classes, courses, departments) are created from Structure. Here you can add societies and custom groups such as committees."
      >
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="group-name">
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Exam Committee"
            />
          </Field>
          <Field label="Type" htmlFor="group-type">
            <Select
              id="group-type"
              value={type}
              onChange={(e) => {
                const next = e.target.value as 'SOCIETY' | 'CUSTOM';
                setType(next);
                setSettings(defaultGroupSettings(next));
              }}
            >
              <option value="CUSTOM">Custom group (committee, office cell…)</option>
              <option value="SOCIETY">Society (open to join)</option>
            </Select>
          </Field>
          <Field label="Description" htmlFor="group-description" className="sm:col-span-2">
            <Textarea
              id="group-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <div className="sm:col-span-2">
            <SettingsEditor settings={settings} onChange={setSettings} system={false} />
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              <Plus /> Create group
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function GroupsPage() {
  const [params, setParams] = useSearchParams();
  const [type, setType] = useState<GroupType | ''>('');
  const [createOpen, setCreateOpen] = useState(false);
  const selectedId = params.get('focus');
  const groups = useQuery({
    queryKey: ['admin', 'groups', type],
    queryFn: () => api.admin.groups(type || undefined),
    placeholderData: keepPreviousData,
  });
  const selected = groups.data?.find((g) => g.id === selectedId);
  const select = (id: string) => setParams({ focus: id }, { replace: true });

  return (
    <>
      <PageHeader
        title="Groups"
        description="Every group and its communication rules. Private conversations (DMs) are never listed here."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> New group
          </Button>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card
          title={groups.data ? `${groups.data.length} groups` : 'Groups'}
          actions={
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as GroupType | '')}
              aria-label="Filter by type"
              className="w-52"
            >
              <option value="">All types</option>
              {GROUP_TYPES.filter((t) => t !== 'DIRECT').map((t) => (
                <option key={t} value={t}>
                  {GROUP_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          }
        >
          {groups.isPending ? (
            <div className="p-6">
              <Spinner />
            </div>
          ) : !groups.data?.length ? (
            <EmptyState icon={Shapes} title="No groups" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Who can post</th>
                  <th className="text-right">Members</th>
                </tr>
              </thead>
              <tbody>
                {groups.data.map((g) => (
                  <tr
                    key={g.id}
                    onClick={() => select(g.id)}
                    className={cn('cursor-pointer', g.id === selectedId && 'bg-primary-soft/60')}
                  >
                    <td>
                      <button
                        type="button"
                        className="flex items-center gap-2.5 text-left"
                        onClick={() => select(g.id)}
                      >
                        <GroupIcon type={g.type} size="sm" />
                        <span>
                          <span className="block font-medium whitespace-nowrap">{g.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {GROUP_TYPE_LABELS[g.type]}
                          </span>
                        </span>
                      </button>
                    </td>
                    <td className="text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        {g.settings.locked && (
                          <Lock className="size-3.5 text-warning" aria-label="Locked" />
                        )}
                        {describePostPolicy(g)}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{g.memberCount}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        {selected ? (
          <ManageGroup key={selected.id} group={selected} />
        ) : (
          <Card>
            <EmptyState icon={Shapes} title="Select a group">
              Change who can post, lock it, or manage its members.
            </EmptyState>
          </Card>
        )}
      </div>
      <CreateGroupDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={select} />
    </>
  );
}
