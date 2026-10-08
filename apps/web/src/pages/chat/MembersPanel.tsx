import {
  canManageMembers,
  canModerate,
  canMuteMember,
  type GroupDTO,
  type MemberDTO,
  type MemberRole,
  toPolicyGroup,
  toPolicyMembership,
  toPolicyUser,
} from '@cui/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  BellOff,
  BellRing,
  Ellipsis,
  MessageCircle,
  ShieldCheck,
  ShieldMinus,
  UserMinus,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Spinner } from '@/components/feedback';
import { Avatar, RoleBadge, roleLabel } from '@/components/people';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/menu';
import { useCurrentUser, useMembers } from '@/hooks/queries';
import { ApiError, api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { ACK_TIMEOUT_MS, getSocket, withAck } from '@/lib/socket';
import { formatRemaining } from '@/lib/utils';
import { useRealtime } from '@/state/realtime';
import { useOpenDirect } from './dialogs';

const MUTE_OPTIONS = [
  { minutes: 15, label: '15 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 24 * 60, label: '1 day' },
];

function isMuted(member: MemberDTO): boolean {
  return !!member.mutedUntil && new Date(member.mutedUntil) > new Date();
}

export function MembersPanel({ group, onClose }: { group: GroupDTO; onClose: () => void }) {
  const me = useCurrentUser();
  const qc = useQueryClient();
  const online = useRealtime((s) => s.online);
  const openDirect = useOpenDirect();
  const { data: members, isPending } = useMembers(group.id);

  const policyUser = toPolicyUser(me);
  const policyGroup = toPolicyGroup(group);
  const myMembership = toPolicyMembership(group);
  const moderator = canModerate(policyUser, policyGroup, myMembership).allowed;
  const manager = canManageMembers(policyUser, policyGroup, myMembership).allowed;

  const mute = async (member: MemberDTO, minutes: number) => {
    const res = await withAck(
      getSocket()
        .timeout(ACK_TIMEOUT_MS)
        .emitWithAck('member:mute', { groupId: group.id, userId: member.user.id, minutes }),
    );
    if (!res.ok) toast.error(res.message);
    else
      toast.success(
        minutes
          ? `${member.user.name} muted for ${formatRemaining(res.data.mutedUntil ?? '')}`
          : `${member.user.name} unmuted`,
      );
  };

  const setRole = async (member: MemberDTO, role: MemberRole) => {
    try {
      await api.setMemberRole(group.id, member.user.id, role);
      void qc.invalidateQueries({ queryKey: keys.members(group.id) });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not change the role.');
    }
  };

  const remove = async (member: MemberDTO) => {
    try {
      await api.removeMember(group.id, member.user.id);
      void qc.invalidateQueries({ queryKey: keys.members(group.id) });
      toast.success(`${member.user.name} was removed`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not remove the member.');
    }
  };

  const staff = members?.filter((m) => m.role !== 'member') ?? [];
  const regular = members?.filter((m) => m.role === 'member') ?? [];
  const onlineCount =
    members?.filter((m) => online.has(m.user.id) || m.user.id === me.id).length ?? 0;

  const renderMember = (member: MemberDTO) => {
    const self = member.user.id === me.id;
    const muted = isMuted(member);
    const muteAllowed =
      !self &&
      moderator &&
      canMuteMember(policyUser, policyGroup, myMembership, {
        userId: member.user.id,
        membership: { role: member.role, mutedUntil: member.mutedUntil },
      }).allowed;
    const editable = manager && !self && member.source === 'manual';
    return (
      <li
        key={member.user.id}
        className="group/member flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-surface-2 has-[[data-state=open]]:bg-surface-2"
      >
        <Avatar name={member.user.name} size="sm" online={self || online.has(member.user.id)} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[14px]">
            <span className="truncate font-semibold">
              {member.user.name}
              {self && <span className="font-normal text-muted-foreground"> (you)</span>}
            </span>
            <RoleBadge person={member.user} />
          </p>
          <p className="flex items-center gap-1.5 truncate text-[12.5px] text-muted-foreground">
            {member.role !== 'member' && (
              <span className="inline-flex items-center gap-0.5 font-medium text-primary dark:text-link">
                <ShieldCheck className="size-3" aria-hidden />
                {member.role === 'owner' ? 'Owner' : 'Moderator'}
              </span>
            )}
            <span className="truncate">
              {member.user.regNo ?? member.user.designation ?? roleLabel(member.user)}
            </span>
          </p>
        </div>
        {muted && (
          <Badge tone="warning" title={`Muted for ${formatRemaining(member.mutedUntil ?? '')}`}>
            <BellOff /> {formatRemaining(member.mutedUntil ?? '')}
          </Badge>
        )}
        {!self && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Actions for ${member.user.name}`}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover/member:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
              >
                <Ellipsis className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => void openDirect(member.user.id)}>
                <MessageCircle /> Send direct message
              </DropdownMenuItem>
              {muteAllowed && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Moderation</DropdownMenuLabel>
                  {muted ? (
                    <DropdownMenuItem onSelect={() => void mute(member, 0)}>
                      <BellRing /> Unmute
                    </DropdownMenuItem>
                  ) : (
                    MUTE_OPTIONS.map((option) => (
                      <DropdownMenuItem
                        key={option.minutes}
                        onSelect={() => void mute(member, option.minutes)}
                      >
                        <BellOff /> Mute for {option.label}
                      </DropdownMenuItem>
                    ))
                  )}
                </>
              )}
              {editable && (
                <>
                  <DropdownMenuSeparator />
                  {member.role === 'member' ? (
                    <DropdownMenuItem onSelect={() => void setRole(member, 'moderator')}>
                      <ShieldCheck /> Make moderator
                    </DropdownMenuItem>
                  ) : member.role === 'moderator' ? (
                    <DropdownMenuItem onSelect={() => void setRole(member, 'member')}>
                      <ShieldMinus /> Remove moderator role
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem danger onSelect={() => void remove(member)}>
                    <UserMinus /> Remove from group
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </li>
    );
  };

  return (
    <aside className="fixed inset-y-0 right-0 z-30 flex w-[min(320px,100vw)] flex-col border-l bg-surface shadow-[0_0_40px_rgb(0_0_0/0.15)] xl:static xl:z-auto xl:shadow-none">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <div>
          <h2 className="text-[16px] leading-tight font-bold">Members</h2>
          <p className="text-[12.5px] text-muted-foreground">
            {group.memberCount} members · {onlineCount} active
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close members">
          <X />
        </Button>
      </header>
      {group.description && (
        <p className="border-b px-4 py-3 text-[13px] text-muted-foreground">{group.description}</p>
      )}
      <div className="scrollbar-thin flex-1 overflow-y-auto px-2 py-3">
        {isPending ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : (
          <>
            {staff.length > 0 && (
              <section className="mb-3">
                <h3 className="px-2 pb-1 text-[12.5px] font-semibold text-muted-foreground">
                  Moderators — {staff.length}
                </h3>
                <ul>{staff.map(renderMember)}</ul>
              </section>
            )}
            <section>
              <h3 className="px-2 pb-1 text-[12.5px] font-semibold text-muted-foreground">
                Members — {regular.length}
              </h3>
              <ul>{regular.map(renderMember)}</ul>
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
