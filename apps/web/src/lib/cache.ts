/** React Query cache updates driven by Socket.IO events and optimistic sends. */
import type { GroupDTO, MessageDTO, MessagesPage } from '@cui/shared';
import type { InfiniteData, QueryClient } from '@tanstack/react-query';

export type ClientMessage = MessageDTO & { status?: 'sending' | 'failed'; error?: string };
export type MessagesData = InfiniteData<
  MessagesPage & { messages: ClientMessage[] },
  string | undefined
>;

export const keys = {
  me: ['me'] as const,
  groups: ['groups'] as const,
  messages: (groupId: string) => ['messages', groupId] as const,
  members: (groupId: string) => ['members', groupId] as const,
  directory: (q: string) => ['directory', q] as const,
  discover: ['discover'] as const,
};

export function sortGroups(groups: GroupDTO[]): GroupDTO[] {
  return [...groups].sort(
    (a, b) =>
      (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '') || a.name.localeCompare(b.name),
  );
}

/** Inserts a message, or replaces it (matched by id, or by clientId for an optimistic copy). */
export function upsertMessage(qc: QueryClient, message: ClientMessage): void {
  qc.setQueryData<MessagesData>(keys.messages(message.groupId), (data) => {
    if (!data) return data;
    let replaced = false;
    const pages = data.pages.map((page) => ({
      ...page,
      messages: page.messages.map((m) => {
        const sameOptimistic = !!message.clientId && m.clientId === message.clientId;
        if (m.id === message.id || sameOptimistic) {
          replaced = true;
          return message;
        }
        return m;
      }),
    }));
    if (replaced) return { ...data, pages };
    const [newest, ...older] = pages;
    if (!newest)
      return { pages: [{ messages: [message], hasMore: false }], pageParams: [undefined] };
    return { ...data, pages: [{ ...newest, messages: [...newest.messages, message] }, ...older] };
  });
}

export function patchMessage(
  qc: QueryClient,
  groupId: string,
  match: (m: ClientMessage) => boolean,
  patch: Partial<ClientMessage>,
): void {
  qc.setQueryData<MessagesData>(keys.messages(groupId), (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            messages: page.messages.map((m) => (match(m) ? { ...m, ...patch } : m)),
          })),
        }
      : data,
  );
}

export function removeMessage(
  qc: QueryClient,
  groupId: string,
  match: (m: ClientMessage) => boolean,
) {
  qc.setQueryData<MessagesData>(keys.messages(groupId), (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            messages: page.messages.filter((m) => !match(m)),
          })),
        }
      : data,
  );
}

export function patchGroup(
  qc: QueryClient,
  groupId: string,
  patch: Partial<GroupDTO> | ((g: GroupDTO) => Partial<GroupDTO>),
): void {
  qc.setQueryData<GroupDTO[]>(keys.groups, (groups) =>
    groups
      ? sortGroups(
          groups.map((g) =>
            g.id === groupId ? { ...g, ...(typeof patch === 'function' ? patch(g) : patch) } : g,
          ),
        )
      : groups,
  );
}

export function upsertGroup(qc: QueryClient, group: GroupDTO): void {
  qc.setQueryData<GroupDTO[]>(keys.groups, (groups) => {
    if (!groups) return [group];
    const exists = groups.some((g) => g.id === group.id);
    return sortGroups(
      exists ? groups.map((g) => (g.id === group.id ? group : g)) : [...groups, group],
    );
  });
}

export function removeGroup(qc: QueryClient, groupId: string): void {
  qc.setQueryData<GroupDTO[]>(keys.groups, (groups) => groups?.filter((g) => g.id !== groupId));
  qc.removeQueries({ queryKey: keys.messages(groupId) });
  qc.removeQueries({ queryKey: keys.members(groupId) });
}

export function findGroup(qc: QueryClient, groupId: string): GroupDTO | undefined {
  return qc.getQueryData<GroupDTO[]>(keys.groups)?.find((g) => g.id === groupId);
}
