import type { NotificationDTO, NotificationsPage } from '@cui/shared';
import {
  type InfiniteData,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';

type Pages = InfiniteData<NotificationsPage, string | undefined>;

export function useNotifications() {
  return useInfiniteQuery({
    queryKey: keys.notifications,
    queryFn: ({ pageParam }) => api.notifications(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => (page.hasMore ? page.notifications.at(-1)?.id : undefined),
    staleTime: 60_000,
  });
}

export function useUnreadNotifications(): number {
  const { data } = useNotifications();
  return data?.pages[0]?.unread ?? 0;
}

/** A pushed notification goes on top of the list and bumps the unread count. */
export function addNotification(qc: QueryClient, notification: NotificationDTO): void {
  qc.setQueryData<Pages>(keys.notifications, (data) => {
    if (!data?.pages[0]) return data;
    const [first, ...rest] = data.pages;
    if (first.notifications.some((n) => n.id === notification.id)) return data;
    return {
      ...data,
      pages: [
        {
          ...first,
          notifications: [notification, ...first.notifications],
          unread: first.unread + (notification.read ? 0 : 1),
        },
        ...rest,
      ],
    };
  });
}

function applyRead(qc: QueryClient, ids: string[] | 'all', unread: number): void {
  qc.setQueryData<Pages>(keys.notifications, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page, i) => ({
            ...page,
            unread: i === 0 ? unread : page.unread,
            notifications: page.notifications.map((n) =>
              ids === 'all' || ids.includes(n.id) ? { ...n, read: true } : n,
            ),
          })),
        }
      : data,
  );
}

export function useMarkNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[] | 'all') =>
      api.markNotifications(ids === 'all' ? { all: true } : { ids }),
    onSuccess: ({ unread }, ids) => applyRead(qc, ids, unread),
  });
}
