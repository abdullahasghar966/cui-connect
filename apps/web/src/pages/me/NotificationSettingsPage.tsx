import {
  NOTIFICATION_LEVEL_LABELS,
  NOTIFICATION_LEVELS,
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_TYPES,
  type NotificationLevel,
  type NotificationSettingsDTO,
  type NotificationType,
} from '@cui/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellOff } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState, Spinner } from '@/components/feedback';
import { PushCard } from '@/components/PushCard';
import { Card, PageHeader } from '@/components/page';
import { Checkbox, Select } from '@/components/ui/form';
import { errorMessage } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';

const HINTS: Record<NotificationType, string> = {
  timetable: 'Classes cancelled, moved or added',
  results: 'Marks published and final results',
  exams: 'Date sheets, exam seats and changes',
  attendance: 'Attendance shortages and corrections',
  coursework: 'New assignments, materials, due dates and live quizzes',
  mentions: 'When someone @mentions you in a chat',
  requests: 'Replies and decisions on requests and complaints',
  registration: 'Course registration opening, approvals and seat changes',
  evaluation: 'Course evaluations opening, and results for teachers',
  campus: 'New jobs, answers about lost & found, and bus notices',
  fees: 'New challans, reminders and payments received',
  events: 'Event approvals, changes and reminders',
  bookings: 'Office-hour appointments booked or cancelled',
  system: 'Urgent notices from IT Services',
};

/** Which kinds of notification reach you, and whether they also go to your phone. */
export default function NotificationSettingsPage() {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: keys.notificationSettings,
    queryFn: api.notificationSettings,
  });
  const save = useMutation({
    mutationFn: (next: NotificationSettingsDTO) =>
      api.saveNotificationSettings({
        levels: next.levels,
        directMessagePush: next.directMessagePush,
      }),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: keys.notificationSettings });
      const previous = qc.getQueryData<NotificationSettingsDTO>(keys.notificationSettings);
      qc.setQueryData(keys.notificationSettings, next);
      return { previous };
    },
    onSuccess: (saved) => {
      qc.setQueryData(keys.notificationSettings, saved);
      toast.success('Saved');
    },
    onError: (err, _next, context) => {
      if (context?.previous) qc.setQueryData(keys.notificationSettings, context.previous);
      toast.error(errorMessage(err));
    },
  });

  if (settings.isPending) {
    return (
      <div className="p-6">
        <Spinner />
      </div>
    );
  }
  if (!settings.data) return <EmptyState icon={BellOff} title="Settings could not be loaded" />;
  const current = settings.data;
  const setLevel = (type: NotificationType, level: NotificationLevel) =>
    save.mutate({ ...current, levels: { ...current.levels, [type]: level } });

  return (
    <>
      <PageHeader
        title="Notification settings"
        description="Choose what reaches you, and where. Changes are saved straight away."
      />
      <PushCard />
      <div className="space-y-5">
        <Card
          title="What reaches you"
          description="“Only in the app” keeps it in the bell, but off your phone. “Off” stops it completely."
        >
          <ul className="divide-y">
            {NOTIFICATION_TYPES.map((type) => {
              const locked = current.alwaysOn.includes(type);
              return (
                <li
                  key={type}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
                >
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="text-[14px] font-semibold">{NOTIFICATION_TYPE_LABELS[type]}</p>
                    <p className="text-[12.5px] text-muted-foreground">{HINTS[type]}</p>
                  </div>
                  {locked ? (
                    <span className="text-[13px] font-semibold text-muted-foreground">
                      Always on
                    </span>
                  ) : (
                    <Select
                      aria-label={NOTIFICATION_TYPE_LABELS[type]}
                      value={current.levels[type]}
                      onChange={(e) => setLevel(type, e.target.value as NotificationLevel)}
                      className="w-44"
                    >
                      {NOTIFICATION_LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {NOTIFICATION_LEVEL_LABELS[level]}
                        </option>
                      ))}
                    </Select>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
        <Card title="Direct messages">
          <div className="px-4 py-3">
            <Checkbox
              label="Send direct messages to my phone while I'm not online"
              checked={current.directMessagePush}
              onChange={(e) => save.mutate({ ...current, directMessagePush: e.target.checked })}
            />
            <p className="mt-1 pl-6 text-[12.5px] text-muted-foreground">
              They always arrive in Chats either way.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
