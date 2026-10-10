import { NotificationList } from '@/components/NotificationList';
import { Card, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { useMarkNotifications, useUnreadNotifications } from '@/hooks/useNotifications';

export default function NotificationsPage() {
  const unread = useUnreadNotifications();
  const mark = useMarkNotifications();
  return (
    <main className="scrollbar-thin min-w-0 flex-1 overflow-y-auto bg-background">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader
          title="Notifications"
          description="Marks, timetable changes, exam seats, mentions and replies to your requests."
          actions={
            unread ? (
              <Button variant="outline" onClick={() => mark.mutate('all')}>
                Mark all as read
              </Button>
            ) : undefined
          }
        />
        <Card>
          <NotificationList />
        </Card>
      </div>
    </main>
  );
}
