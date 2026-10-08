import {
  canLeave,
  canModerate,
  describePostPolicy,
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
  SearchX,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, Spinner } from '@/components/feedback';
import { GroupIcon } from '@/components/group-meta';
import { Avatar, RoleBadge } from '@/components/people';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
} from '@/components/ui/menu';
import { useCurrentUser, useGroup, useGroups, useMembers } from '@/hooks/queries';
import { patchGroup, removeGroup } from '@/lib/cache';
import { ACK_TIMEOUT_MS, getSocket, withAck } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { useRealtime } from '@/state/realtime';
import { Composer } from './Composer';
import { MembersPanel } from './MembersPanel';
import { MessageList } from './MessageList';

/** Who may post here, shown like a channel topic under the name. */
function PolicyLine({ group }: { group: GroupDTO }) {
  const restricted = group.settings.locked || group.settings.postPolicy !== 'all';
  const Icon = group.settings.locked ? Lock : restricted ? Megaphone : null;
  return (
    <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted-foreground">
      {Icon && <Icon className="size-3.5 shrink-0" aria-hidden />}
      <span className={cn('shrink-0', group.settings.locked && 'font-semibold text-warning')}>
        {describePostPolicy(group)}
      </span>
      {group.description && (
        <>
          <span aria-hidden>·</span>
          <span className="truncate">{group.description}</span>
        </>
      )}
    </p>
  );
}

function MembersButton({
  group,
  open,
  onClick,
}: {
  group: GroupDTO;
  open: boolean;
  onClick: () => void;
}) {
  const { data: members } = useMembers(group.id);
  const faces = members?.slice(0, 3) ?? [];
  return (
    <Tooltip content="View members">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={open}
        aria-label={`Members (${group.memberCount})`}
        className={cn(
          'flex h-8 items-center gap-1.5 rounded-md border border-border-strong pr-2.5 pl-1 transition-colors hover:bg-muted',
          open && 'bg-muted',
        )}
      >
        <span className="flex -space-x-1">
          {faces.map((m) => (
            <Avatar
              key={m.user.id}
              name={m.user.name}
              size="xs"
              className="rounded-[5px] ring-2 ring-surface"
            />
          ))}
          {faces.length === 0 && <Users className="ml-1 size-4" aria-hidden />}
        </span>
        <span className="text-[13px] font-semibold tabular-nums">{group.memberCount}</span>
      </button>
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

  const isDirect = group.type === 'DIRECT' && !!group.peer;

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <Link
        to="/chat"
        className="-ml-1.5 inline-flex size-8 items-center justify-center rounded-md hover:bg-muted md:hidden"
        aria-label="Back to conversations"
      >
        <ArrowLeft className="size-4" />
      </Link>
      <div className="min-w-0 flex-1">
        <h1 className="flex min-w-0 items-center gap-1.5 text-[16.5px] leading-tight font-bold">
          {isDirect && group.peer ? (
            <Avatar name={group.peer.name} size="xs" online={peerOnline} />
          ) : (
            <GroupIcon
              type={group.type}
              settings={group.settings}
              className="size-[17px] text-muted-foreground"
            />
          )}
          <span className="truncate">{group.name}</span>
          {group.peer && <RoleBadge person={group.peer} showStudent />}
        </h1>
        {isDirect && group.peer ? (
          <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
            {[
              peerOnline ? 'Active now' : 'Away',
              group.peer.designation ?? group.peer.regNo,
              group.peer.departmentCode,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        ) : (
          <PolicyLine group={group} />
        )}
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
            variant="secondary"
            size="md"
            onClick={() => void toggleLock()}
            loading={busy}
            aria-label={group.settings.locked ? 'Unlock group' : 'Lock group'}
          >
            {group.settings.locked ? <LockOpen /> : <Lock />}
            <span className="hidden sm:inline">{group.settings.locked ? 'Unlock' : 'Lock'}</span>
          </Button>
        </Tooltip>
      )}
      {!isDirect && <MembersButton group={group} open={membersOpen} onClick={onToggleMembers} />}
      {leavable && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="More options">
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
    <div className="flex min-h-0 min-w-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col bg-background">
        <ChatHeader
          group={group}
          membersOpen={membersOpen}
          onToggleMembers={() => setMembersOpen((v) => !v)}
        />
        <MessageList key={group.id} group={group} />
        <Composer key={`composer-${group.id}`} group={group} />
      </section>
      {membersOpen && group.type !== 'DIRECT' && (
        <MembersPanel group={group} onClose={() => setMembersOpen(false)} />
      )}
    </div>
  );
}
