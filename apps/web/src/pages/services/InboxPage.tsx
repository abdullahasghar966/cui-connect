import { useQuery } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { EmptyState, Spinner } from '@/components/feedback';
import { Card, PageHeader, Tabs } from '@/components/page';
import { useCurrentUser } from '@/hooks/queries';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { isOpen, RequestRow } from './requests-ui';

/** Requests sent to the viewer (as batch advisor) or to their office. */
export default function InboxPage() {
  const me = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'done' ? 'done' : 'open';
  const query = useQuery({
    queryKey: keys.requests('inbox'),
    queryFn: () => api.services.requests('inbox'),
  });
  const all = query.data ?? [];
  const open = all.filter(isOpen);
  const done = all.filter((r) => !isOpen(r));
  const shown = tab === 'open' ? open : done;
  return (
    <>
      <PageHeader
        title="Inbox"
        description={
          me.role === 'faculty'
            ? 'Leave applications from the students you advise.'
            : 'Requests and complaints sent to your office.'
        }
      />
      <Tabs
        label="Inbox"
        value={tab}
        onChange={(value) => setParams(value === 'open' ? {} : { tab: value }, { replace: true })}
        options={[
          { value: 'open', label: 'Waiting', count: open.length },
          { value: 'done', label: 'Answered', count: done.length },
        ]}
      />
      {!query.data ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !shown.length ? (
        <EmptyState
          icon={Inbox}
          title={tab === 'open' ? 'Nothing waiting' : 'Nothing answered yet'}
          className="rounded-lg border bg-surface"
        >
          {tab === 'open' ? 'New requests appear here, and you are told as they arrive.' : null}
        </EmptyState>
      ) : (
        <Card>
          <ul className="divide-y">
            {shown.map((r) => (
              <RequestRow key={r.id} request={r} showStudent />
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
