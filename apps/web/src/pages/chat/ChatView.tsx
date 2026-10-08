import {
  canLeave,
  canModerate,
  describePostPolicy,
  GROUP_TYPE_LABELS,
  type GroupDTO,
  toPolicyGroup,
  toPolicyMembership,
  toPolicyUser,
} from '@cui/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  DoorOpen,
  Ellipsis,
  Lock,
  LockOpen,
  Megaphone,
  MessageCircle,
  SearchX,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, Spinner } from '@/components/feedback';
import { GroupIcon } from '@/components/group-meta';
import { Avatar, RoleBadge, roleLabel } from '@/components/people';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
} from '@/components/ui/menu';
import { useCurrentUser, useGroup, useGroups } from '@/hooks/queries';
import { patchGroup, removeGroup } from '@/lib/cache';
import { ACK_TIMEOUT_MS, getSocket, withAck } from '@/lib/socket';
import { useRealtime } from '@/state/realtime';
import { Composer } from './Composer';
import { MembersPanel } from './MembersPanel';
import { MessageList } from './MessageList';

function PolicyBadge({ group }: { group: GroupDTO }) {
  const text = describePostPolicy(group);
  const restricted = group.settings.locked || group.settings.postPolicy !== 'all';
  const Icon = group.settings.locked
    ? Lock
    : group.type === 'DIRECT'
      ? ShieldCheck
      : restricted
        ? Megaphone
        : MessageCircle;
  return (
    <Tooltip content={group.description ?? text}>
      <span>
        <Badge tone={group.settings.locked ? 'warning' : restricted ? 'primary' : 'neutral'}>
          <Icon aria-hidden /> {text}
        </Badge>
      </span>
    </Tooltip>
  );
}

function ChatHeader({
  group,
  membersOpen,
  onToggleMembers,
}: {
  group: GroupDTO;
  membersOpen: boolean;
  onToggleMembers: () => void;
}) {
  const me = useCurrentUser();
  const qc = useQueryClient();
  const peerOnline = useRealtime((s) => (group.peer ? s.online.has(group.peer.id) : false));
  const [busy, setBusy] = useState(false);
  const policyUser = toPolicyUser(me);
  const policyGroup = toPolicyGroup(group);
  const membership = toPolicyMembership(group);
  const moderator = canModerate(policyUser, policyGroup, membership).allowed;
  const leavable = canLeave(policyUser, policyGroup, membership).allowed;
  // Locking only matters where members can normally post.
  const lockable =
    moderator && group.type !== 'DIRECT' && group.settings.postPolicy !== 'moderators';

  const toggleLock = async () => {
    setBusy(true);
    const locked = !group.settings.locked;
    const res = await withAck(
      getSocket().timeout(ACK_TIMEOUT_MS).emitWithAck('group:lock', { groupId: group.id, locked }),
    );
    setBusy(false);
    if (res.ok) patchGroup(qc, group.id, { settings: res.data });
    else toast.error(res.message);
  };

  const leave = async () => {
    const res = await withAck(
      getSocket().timeout(ACK_TIMEOUT_MS).emitWithAck('group:leave', { groupId: group.id }),
    );
    if (res.ok) removeGroup(qc, group.id);
    else toast.error(res.message);
  };

  const subtitle =
    group.type === 'DIRECT' && group.peer
      ? [
          peerOnline ? 'Online' : roleLabel(group.peer),
          group.peer.designation ?? group.peer.regNo ?? group.peer.departmentCode,
        ]
          .filter(Boolean)
          .join(' · ')
      : `${GROUP_TYPE_LABELS[group.type]} · ${group.memberCount} members`;

  return (
    <header className="flex items-center gap-3 border-b bg-surface px-3 py-2.5 sm:px-4">
      <Link
        to="/chat"
        className="-ml-1 inline-flex size-8 items-center justify-center rounded-lg hover:bg-muted md:hidden"
        aria-label="Back to conversations"
      >
        <ArrowLeft className="size-4" />
      </Link>
      {group.type === 'DIRECT' && group.peer ? (
        <Avatar name={group.peer.name} online={peerOnline} />
      ) : (
        <GroupIcon type={group.type} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-[15px] font-semibold">{group.name}</h1>
          {group.peer && <RoleBadge person={group.peer} showStudent />}
        </div>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="hidden lg:block">
        <PolicyBadge group={group} />
      </div>
      {lockable && (
        <Tooltip
          content={
            group.settings.locked
              ? 'Allow members to post again'
              : 'Make announcement-only: only moderators can post'
          }
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => void toggleLock()}
            loading={busy}
            aria-label={group.settings.locked ? 'Unlock group' : 'Lock group'}
          >
            {group.settings.locked ? <LockOpen /> : <Lock />}
            <span className="hidden sm:inline">{group.settings.locked ? 'Unlock' : 'Lock'}</span>
          </Button>
        </Tooltip>
      )}
      {group.type !== 'DIRECT' && (
        <Tooltip content="Members">
          <Button
            variant={membersOpen ? 'secondary' : 'ghost'}
            size="sm"
            onClick={onToggleMembers}
            aria-pressed={membersOpen}
            aria-label={`Members (${group.memberCount})`}
          >
            <Users /> <span className="tabular-nums">{group.memberCount}</span>
          </Button>
        </Tooltip>
      )}
      {leavable && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More options">
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem danger onSelect={() => void leave()}>
              <DoorOpen /> Leave group
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </header>
  );
}

export function ChatView() {
  const { groupId = '' } = useParams();
  const { isPending } = useGroups();
  const group = useGroup(groupId);
  const [membersOpen, setMembersOpen] = useState(false);

  if (isPending) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!group) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState icon={SearchX} title="Conversation not available">
          You may have been removed from this group, or it no longer exists.{' '}
          <Link to="/chat" className="text-primary underline-offset-4 hover:underline">
            Back to conversations
          </Link>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col bg-background">
        <ChatHeader
          group={group}
          membersOpen={membersOpen}
          onToggleMembers={() => setMembersOpen((v) => !v)}
        />
        <div className="border-b bg-surface-2 px-4 py-1.5 lg:hidden">
          <PolicyBadge group={group} />
        </div>
        <MessageList key={group.id} group={group} />
        <Composer key={`composer-${group.id}`} group={group} />
      </section>
      {membersOpen && group.type !== 'DIRECT' && (
        <MembersPanel group={group} onClose={() => setMembersOpen(false)} />
      )}
    </div>
  );
}
