import type { Ack, MessageDTO } from '@cui/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { type ClientMessage, keys, patchGroup, patchMessage, upsertMessage } from '@/lib/cache';
import { ACK_TIMEOUT_MS, getSocket, withAck } from '@/lib/socket';
import { randomId } from '@/lib/utils';
import { useCurrentUser } from './queries';

/** Optimistic send: the message appears instantly, then is confirmed or marked failed. */
export function useSendMessage() {
  const qc = useQueryClient();
  const me = useCurrentUser();

  return useCallback(
    async (groupId: string, body: string, retryClientId?: string): Promise<Ack<MessageDTO>> => {
      const clientId = retryClientId ?? randomId();
      const optimistic: ClientMessage = {
        id: `local-${clientId}`,
        groupId,
        body,
        createdAt: new Date().toISOString(),
        clientId,
        deleted: false,
        status: 'sending',
        sender: {
          id: me.id,
          name: me.name,
          role: me.role,
          designation: me.designation,
          office: me.office,
          isHOD: me.isHOD,
          isCR: me.isCR,
        },
      };
      upsertMessage(qc, optimistic);

      const res = await withAck(
        getSocket()
          .timeout(ACK_TIMEOUT_MS)
          .emitWithAck('message:send', { groupId, body, clientId }),
      );
      if (res.ok) {
        upsertMessage(qc, res.data);
        patchGroup(qc, groupId, {
          lastMessage: res.data,
          lastMessageAt: res.data.createdAt,
          lastReadMessageId: res.data.id,
        });
      } else {
        patchMessage(qc, groupId, (m) => m.clientId === clientId && !!m.status, {
          status: 'failed',
          error: res.message,
        });
        toast.error(res.message);
      }
      return res;
    },
    [qc, me],
  );
}

export function useDeleteMessage() {
  return useCallback(async (messageId: string) => {
    const res = await withAck(
      getSocket().timeout(ACK_TIMEOUT_MS).emitWithAck('message:delete', { messageId }),
    );
    if (!res.ok) toast.error(res.message);
  }, []);
}

/** Moves the read marker forward and clears the unread badge locally. */
export function useMarkRead() {
  const qc = useQueryClient();
  return useCallback(
    (groupId: string, messageId: string) => {
      patchGroup(qc, groupId, { unread: 0, lastReadMessageId: messageId });
      void withAck(
        getSocket().timeout(ACK_TIMEOUT_MS).emitWithAck('message:read', { groupId, messageId }),
      );
    },
    [qc],
  );
}

export function useInvalidateGroups() {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries({ queryKey: keys.groups }), [qc]);
}
