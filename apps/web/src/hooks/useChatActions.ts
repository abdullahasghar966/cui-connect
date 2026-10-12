import type { Ack, MessageDTO, PollInput, Reaction, ReplyRefDTO } from '@cui/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { type ClientMessage, keys, patchGroup, patchMessage, upsertMessage } from '@/lib/cache';
import { ACK_TIMEOUT_MS, getSocket, withAck } from '@/lib/socket';
import { randomId } from '@/lib/utils';
import { useCurrentUser } from './queries';

export interface SendExtras {
  /** Reuse a failed message's id when retrying (the server ignores duplicates). */
  clientId?: string;
  poll?: PollInput;
  replyTo?: ReplyRefDTO | null;
  mentions?: { id: string; name: string }[];
  anonymous?: boolean;
}

/** Optimistic send: the message appears instantly, then is confirmed or marked failed. */
export function useSendMessage() {
  const qc = useQueryClient();
  const me = useCurrentUser();

  return useCallback(
    async (groupId: string, body: string, extras: SendExtras = {}): Promise<Ack<MessageDTO>> => {
      const { poll, replyTo = null, mentions = [], anonymous = false } = extras;
      const clientId = extras.clientId ?? randomId();
      const optimistic: ClientMessage = {
        id: `local-${clientId}`,
        groupId,
        kind: poll ? 'poll' : 'text',
        poll: poll
          ? {
              question: poll.question,
              options: poll.options.map((text, i) => ({ id: `o${i + 1}`, text, voterIds: [] })),
              multiple: poll.multiple ?? false,
              closedAt: null,
              voters: 0,
            }
          : null,
        body,
        createdAt: new Date().toISOString(),
        clientId,
        deleted: false,
        replyTo,
        reactions: [],
        pinned: null,
        mentions,
        anonymous,
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
          .emitWithAck('message:send', {
            groupId,
            body,
            clientId,
            ...(poll ? { poll: { ...poll, multiple: poll.multiple ?? false } } : {}),
            ...(replyTo ? { replyToId: replyTo.id } : {}),
            ...(mentions.length ? { mentionIds: mentions.map((m) => m.id) } : {}),
            ...(anonymous ? { anonymous: true } : {}),
          }),
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

/** Adds or takes back your reaction; the chat sees it through `message:updated`. */
export function useReact() {
  const qc = useQueryClient();
  return useCallback(
    async (groupId: string, messageId: string, emoji: Reaction) => {
      const res = await withAck(
        getSocket().timeout(ACK_TIMEOUT_MS).emitWithAck('message:react', { messageId, emoji }),
      );
      if (res.ok) patchMessage(qc, groupId, (m) => m.id === messageId, { reactions: res.data });
      else toast.error(res.message);
    },
    [qc],
  );
}

export function usePin() {
  const qc = useQueryClient();
  return useCallback(
    async (groupId: string, messageId: string, pinned: boolean) => {
      const res = await withAck(
        getSocket().timeout(ACK_TIMEOUT_MS).emitWithAck('message:pin', { messageId, pinned }),
      );
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      patchMessage(qc, groupId, (m) => m.id === messageId, { pinned: res.data });
      void qc.invalidateQueries({ queryKey: keys.pins(groupId) });
      toast.success(pinned ? 'Pinned to this chat' : 'Unpinned');
    },
    [qc],
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
