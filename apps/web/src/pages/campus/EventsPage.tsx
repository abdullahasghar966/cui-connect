import { type CampusEventDTO, EVENT_CATEGORIES, EVENT_CATEGORY_LABELS } from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { CalendarHeart, Plus } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { EmptyState, Spinner } from '@/components/feedback';
import { Card, PageHeader, Tabs } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { EventCard, EventDialog } from './events-ui';

type Tab = 'upcoming' | 'past' | 'waiting';

/** What's on around campus: upcoming events, past ones, and those waiting for approval. */
export default function EventsPage() {
  const query = useQuery({ queryKey: keys.campusEvents, queryFn: api.campus.events });
  const [params, setParams] = useSearchParams();
  const tab = (
    ['past', 'waiting'].includes(params.get('tab') ?? '') ? params.get('tab') : 'upcoming'
  ) as Tab;
  const [category, setCategory] = useState('');
  const [creating, setCreating] = useState(false);
  const data = query.data;
  const moderator = data?.canModerate;
  const lists: Record<Tab, CampusEventDTO[]> = {
    upcoming: data?.upcoming ?? [],
    past: data?.past ?? [],
    waiting: data?.waiting ?? [],
  };
  const shown = lists[tab].filter((e) => !category || e.category === category);

  return (
    <>
      <PageHeader
        title="Events"
        description="Talks, workshops, competitions, sports and more. Say you're going and you'll get a reminder the evening before."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> New event
          </Button>
        }
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Tabs
          label="Events"
          value={tab}
          onChange={(value) =>
            setParams(value === 'upcoming' ? {} : { tab: value }, { replace: true })
          }
          options={[
            { value: 'upcoming', label: 'Coming up', count: lists.upcoming.length },
            { value: 'past', label: 'Past' },
            ...(lists.waiting.length || moderator
              ? [
                  {
                    value: 'waiting' as const,
                    label: moderator ? 'To approve' : 'My proposals',
                    count: lists.waiting.length,
                  },
                ]
              : []),
          ]}
          className="mb-0 flex-1"
        />
        <Select
          aria-label="Kind of event"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="mb-3 w-auto"
        >
          <option value="">All kinds</option>
          {EVENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {EVENT_CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>
      </div>
      {!data ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !shown.length ? (
        <EmptyState
          icon={CalendarHeart}
          title="Nothing here"
          className="rounded-lg border bg-surface"
        >
          {tab === 'waiting'
            ? 'Events waiting for Student Affairs appear here.'
            : tab === 'past'
              ? 'Past events appear here.'
              : 'New events appear here. You can propose one too.'}
        </EmptyState>
      ) : (
        <Card>
          <ul className="divide-y">
            {shown.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </ul>
        </Card>
      )}
      {creating && data && (
        <EventDialog event={null} direct={data.canPublish} onClose={() => setCreating(false)} />
      )}
    </>
  );
}
