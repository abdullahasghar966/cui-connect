/**
 * Bridges Socket.IO events into the React Query cache and the realtime store, so every
 * component simply renders cached data and updates arrive without refetching.
 */
import type {
  GroupDTO,
  GroupUpdateEvent,
  MemberDTO,
  MemberUpdateEvent,
  MessageDTO,
  NotificationDTO,
  TypingEvent,
} from '@cui/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useMatch, useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  findGroup,
  keys,
  patchGroup,
  patchMessage,
  removeGroup,
  upsertGroup,
  upsertMessage,
} from '@/lib/cache';
import { ACK_TIMEOUT_MS, closeSocket, getSocket, withAck } from '@/lib/socket';
import { formatRemaining } from '@/lib/utils';
import { useRealtime } from '@/state/realtime';
import { useCurrentUser } from './queries';
import { addNotification } from './useNotifications';

export function useRealtimeSync(): void {
  const me = useCurrentUser();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const match = useMatch('/chat/:groupId');
  const activeGroupId = useRef<string | null>(null);
  activeGroupId.current = match?.params.groupId ?? null;

  useEffect(() => {
    const socket = getSocket();
    const rt = useRealtime.getState();
    let hadConnection = false;

    const endSession = (reason: string) => {
      closeSocket();
      useRealtime.getState().reset();
      qc.clear();
      qc.setQueryData(keys.me, null);
      toast.error(reason);
      navigate('/login', { replace: true });
    };

    const onConnect = () => {
      rt.setStatus('connected');
      void withAck(socket.timeout(ACK_TIMEOUT_MS).emitWithAck('presence:list')).then((res) => {
        if (res.ok) useRealtime.getState().setOnline(res.data);
      });
      // A reconnect that couldn't replay missed events: refetch what may be stale.
      if (hadConnection && !socket.recovered) {
        void qc.invalidateQueries({ queryKey: keys.groups });
        void qc.invalidateQueries({ queryKey: ['messages'] });
        void qc.invalidateQueries({ queryKey: keys.notifications });
      }
      hadConnection = true;
    };

    const onDisconnect = (reason: string) => {
      rt.setStatus(reason === 'io client disconnect' ? 'offline' : 'reconnecting');
    };

    const onConnectError = (err: Error) => {
      if (err.message === 'UNAUTHENTICATED') {
        endSession('Your session has ended. Please sign in again.');
      } else {
        rt.setStatus('reconnecting');
      }
    };

    const onMessage = (message: MessageDTO) => {
      upsertMessage(qc, message);
      const group = findGroup(qc, message.groupId);
      if (!group) {
        void qc.invalidateQueries({ queryKey: keys.groups });
        return;
      }
      const mine = message.sender.id === me.id;
      const viewing =
        activeGroupId.current === message.groupId && document.visibilityState === 'visible';
      patchGroup(qc, message.groupId, (g) => ({
        lastMessage: message,
        lastMessageAt: message.createdAt,
        unread: mine || viewing ? g.unread : Math.min(g.unread + 1, 99),
      }));
      useRealtime.getState().setTyping({
        groupId: message.groupId,
        userId: message.sender.id,
        name: message.sender.name,
        typing: false,
      });
    };

    const onMessageDeleted = ({ groupId, messageId }: { groupId: string; messageId: string }) => {
      patchMessage(qc, groupId, (m) => m.id === messageId, { deleted: true, body: '' });
      patchGroup(qc, groupId, (g) =>
        g.lastMessage?.id === messageId
          ? { lastMessage: { ...g.lastMessage, deleted: true, body: '' } }
          : {},
      );
    };

    const onTyping = (event: TypingEvent) => useRealtime.getState().setTyping(event);

    const onPresence = ({ userId, online }: { userId: string; online: boolean }) =>
      useRealtime.getState().setPresence(userId, online);

    const onRead = ({
      groupId,
      userId,
      messageId,
    }: {
      groupId: string;
      userId: string;
      messageId: string;
    }) => {
      if (userId === me.id) patchGroup(qc, groupId, { lastReadMessageId: messageId, unread: 0 });
      else patchGroup(qc, groupId, { peerLastReadMessageId: messageId });
    };

    const onGroupAdded = (group: GroupDTO) => {
      const known = !!findGroup(qc, group.id);
      upsertGroup(qc, group);
      if (known) return;
      if (group.type === 'DIRECT') {
        if (group.createdById !== me.id && group.peer) {
          toast(`New conversation with ${group.peer.name}`);
        }
      } else {
        toast.success(`You were added to ${group.name}`);
      }
    };

    const onGroupRemoved = ({ groupId, reason }: { groupId: string; reason: string }) => {
      const group = findGroup(qc, groupId);
      removeGroup(qc, groupId);
      if (group) toast.info(`${group.name}: ${reason}`);
      if (activeGroupId.current === groupId) navigate('/chat', { replace: true });
    };

    const onGroupUpdated = (update: GroupUpdateEvent) => {
      const { groupId, ...patch } = update;
      const before = findGroup(qc, groupId);
      patchGroup(qc, groupId, patch);
      // Members are told when posting opens/closes; moderators can see the button they used.
      const member = before?.myRole === 'member';
      if (member && patch.settings && patch.settings.locked !== before.settings.locked) {
        toast.info(
          patch.settings.locked
            ? `${before.name} is now announcement-only`
            : `${before.name} is open for discussion again`,
        );
      }
    };

    const onMemberUpdated = (update: MemberUpdateEvent) => {
      const { groupId, userId, ...patch } = update;
      qc.setQueryData<MemberDTO[]>(keys.members(groupId), (members) =>
        members?.map((m) => (m.user.id === userId ? { ...m, ...patch } : m)),
      );
      if (userId !== me.id) return;
      const group = findGroup(qc, groupId);
      patchGroup(qc, groupId, {
        ...(patch.role ? { myRole: patch.role } : {}),
        ...(patch.mutedUntil !== undefined ? { mutedUntil: patch.mutedUntil } : {}),
      });
      if (group && patch.mutedUntil !== undefined) {
        if (patch.mutedUntil) {
          toast.warning(
            `A moderator muted you in ${group.name} for ${formatRemaining(patch.mutedUntil)}`,
          );
        } else {
          toast.success(`You can post in ${group.name} again`);
        }
      }
    };

    const onSessionRevoked = ({ reason }: { reason: string }) => endSession(reason);

    const onNotification = (notification: NotificationDTO) => {
      addNotification(qc, notification);
      const { link } = notification;
      toast(notification.title, {
        description: notification.body ?? undefined,
        action: link ? { label: 'Open', onClick: () => navigate(link) } : undefined,
      });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('message:new', onMessage);
    socket.on('message:deleted', onMessageDeleted);
    socket.on('typing', onTyping);
    socket.on('presence:update', onPresence);
    socket.on('read:update', onRead);
    socket.on('group:added', onGroupAdded);
    socket.on('group:removed', onGroupRemoved);
    socket.on('group:updated', onGroupUpdated);
    socket.on('member:updated', onMemberUpdated);
    socket.on('session:revoked', onSessionRevoked);
    socket.on('notification:new', onNotification);

    if (socket.connected) onConnect();
    else {
      rt.setStatus('connecting');
      socket.connect();
    }

    const prune = window.setInterval(() => useRealtime.getState().pruneTyping(), 1500);

    return () => {
      window.clearInterval(prune);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('message:new', onMessage);
      socket.off('message:deleted', onMessageDeleted);
      socket.off('typing', onTyping);
      socket.off('presence:update', onPresence);
      socket.off('read:update', onRead);
      socket.off('group:added', onGroupAdded);
      socket.off('group:removed', onGroupRemoved);
      socket.off('group:updated', onGroupUpdated);
      socket.off('member:updated', onMemberUpdated);
      socket.off('session:revoked', onSessionRevoked);
      socket.off('notification:new', onNotification);
    };
  }, [me.id, qc, navigate]);
}
