import { useQuery } from '@tanstack/react-query';
import { ClipboardList, MessageSquareWarning, Plus } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, Spinner } from '@/components/feedback';
import { Card, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { isOpen, NewComplaintDialog, NewRequestDialog, RequestRow } from './requests-ui';

/** A student's own requests (or complaints): open ones first, then the answered ones. */
export default function RequestsPage({ complaints = false }: { complaints?: boolean }) {
  const query = useQuery({
    queryKey: keys.requests('mine'),
    queryFn: () => api.services.requests('mine'),
  });
  const [creating, setCreating] = useState(false);
  const mine = (query.data ?? []).filter((r) => (r.kind === 'complaint') === complaints);
  const open = mine.filter(isOpen);
  const done = mine.filter((r) => !isOpen(r));
  return (
    <>
      <PageHeader
        title={complaints ? 'Complaints' : 'Requests'}
        description={
          complaints
            ? 'Tell Student Affairs about a problem on campus. You can follow what happens and reply.'
            : 'Apply for leave, an official transcript, a bonafide certificate or an ID card, and follow each one.'
        }
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> {complaints ? 'New complaint' : 'New request'}
          </Button>
        }
      />
      {!query.data ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !mine.length ? (
        <EmptyState
          icon={complaints ? MessageSquareWarning : ClipboardList}
          title={complaints ? 'No complaints' : 'No requests yet'}
          className="rounded-lg border bg-surface"
        >
          {complaints
            ? 'If something on campus needs fixing, Student Affairs will look into it.'
            : 'Requests you send appear here with their status.'}
        </EmptyState>
      ) : (
        <div className="space-y-5">
          {open.length > 0 && (
            <Card title="Open">
              <ul className="divide-y">
                {open.map((r) => (
                  <RequestRow key={r.id} request={r} />
                ))}
              </ul>
            </Card>
          )}
          {done.length > 0 && (
            <Card title="Answered">
              <ul className="divide-y">
                {done.map((r) => (
                  <RequestRow key={r.id} request={r} />
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
      {creating &&
        (complaints ? (
          <NewComplaintDialog onClose={() => setCreating(false)} />
        ) : (
          <NewRequestDialog onClose={() => setCreating(false)} />
        ))}
    </>
  );
}
