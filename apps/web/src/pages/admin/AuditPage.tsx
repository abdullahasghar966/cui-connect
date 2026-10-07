import type { AuditDTO } from '@cui/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Info, ShieldAlert } from 'lucide-react';
import { useCallback, useState } from 'react';
import { EmptyState, Spinner } from '@/components/feedback';
import { RoleBadge } from '@/components/people';
import { Checkbox } from '@/components/ui/form';
import { useAdminFeed } from '@/hooks/useAdminFeed';
import { api } from '@/lib/api';
import { cn, formatDayLabel, formatTime } from '@/lib/utils';
import { Card, PageHeader, Table } from './ui';

const KEY = ['admin', 'audit'] as const;

export default function AuditPage() {
  const qc = useQueryClient();
  const [warningsOnly, setWarningsOnly] = useState(false);
  const { data, isPending } = useQuery({ queryKey: KEY, queryFn: () => api.admin.audit(200) });

  const onAudit = useCallback(
    (entry: AuditDTO) =>
      qc.setQueryData<AuditDTO[]>(KEY, (list) => [entry, ...(list ?? [])].slice(0, 300)),
    [qc],
  );
  const { connected } = useAdminFeed(onAudit);
  const rows = (data ?? []).filter((e) => !warningsOnly || e.severity === 'warning');

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every administrative change and every blocked attempt to cross a communication boundary. Message contents are never recorded."
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
            <span
              className={cn('size-1.5 rounded-full', connected ? 'bg-success' : 'bg-warning')}
              aria-hidden
            />
            {connected ? 'Streaming live' : 'Connecting…'}
          </span>
        }
      />
      <Card
        title={`${rows.length} entries`}
        actions={
          <Checkbox
            label="Blocked attempts only"
            checked={warningsOnly}
            onChange={(e) => setWarningsOnly(e.target.checked)}
          />
        }
      >
        {isPending ? (
          <div className="p-6">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={ShieldAlert} title="No entries" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th className="w-40">When</th>
                <th>Event</th>
                <th className="w-56">By</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <tr
                  key={entry.id}
                  className={cn(entry.severity === 'warning' && 'bg-danger-soft/40')}
                >
                  <td className="whitespace-nowrap text-muted-foreground">
                    <span className="block text-xs">{formatDayLabel(entry.createdAt)}</span>
                    {formatTime(entry.createdAt)}
                  </td>
                  <td>
                    <span className="flex gap-2">
                      {entry.severity === 'warning' ? (
                        <ShieldAlert
                          className="mt-0.5 size-4 shrink-0 text-danger"
                          aria-label="Blocked"
                        />
                      ) : (
                        <Info
                          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      )}
                      <span>
                        {entry.summary}
                        <code className="ml-2 rounded bg-muted px-1 py-0.5 text-[11px] text-muted-foreground">
                          {entry.action}
                        </code>
                      </span>
                    </span>
                  </td>
                  <td>
                    {entry.actor ? (
                      <span className="flex items-center gap-1.5">
                        <span className="truncate">{entry.actor.name}</span>
                        <RoleBadge person={entry.actor} showStudent />
                      </span>
                    ) : (
                      <span className="text-muted-foreground">System</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
