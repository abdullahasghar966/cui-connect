import type { GroupDTO, UserDTO } from '@cui/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ApiError, api } from '@/lib/api';
import { keys } from '@/lib/cache';

const PAGE_SIZE = 40;

/** The signed-in user, or null when there is no valid session. */
export function useMe() {
  return useQuery<UserDTO | null>({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return (await api.me()).user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** The current user; only call inside authenticated routes. */
export function useCurrentUser(): UserDTO {
  const { data } = useMe();
  if (!data) throw new Error('useCurrentUser used outside an authenticated route');
  return data;
}

export function useGroups() {
  return useQuery<GroupDTO[]>({ queryKey: keys.groups, queryFn: api.groups });
}

export function useGroup(groupId: string | undefined): GroupDTO | undefined {
  const { data } = useGroups();
  return groupId ? data?.find((g) => g.id === groupId) : undefined;
}

export function useMessages(groupId: string) {
  return useInfiniteQuery({
    queryKey: keys.messages(groupId),
    queryFn: ({ pageParam }) => api.messages(groupId, { before: pageParam, limit: PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => (page.hasMore ? page.messages[0]?.id : undefined),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useMembers(groupId: string, enabled = true) {
  return useQuery({
    queryKey: keys.members(groupId),
    queryFn: () => api.members(groupId),
    enabled,
  });
}
