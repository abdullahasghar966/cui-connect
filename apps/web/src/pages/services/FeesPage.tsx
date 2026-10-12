import { FEE_INSTALMENT_LABELS, type FeeChallanDTO, formatPKR, formatShortDate } from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { Banknote, CircleAlert, CircleCheck, Printer } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, Spinner } from '@/components/feedback';
import { Card, PageHeader, Table } from '@/components/page';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { cn } from '@/lib/utils';
import {
  ChallanPrint,
  challanTitle,
  FeeItems,
  FeeStatusBadge,
  feeSummary,
  formatLongDate,
} from './fees-ui';

/** One challan of the current term: what it's for, the charges, and where it stands. */
function ChallanCard({
  challan,
  onPrint,
}: {
  challan: FeeChallanDTO;
  onPrint: (c: FeeChallanDTO) => void;
}) {
  return (
    <Card
      title={challanTitle(challan)}
      description={`Challan ${challan.challanNo} · due ${formatLongDate(challan.dueDate)}`}
      actions={
        <div className="flex items-center gap-2">
          <FeeStatusBadge status={challan.status} />
          <Button size="sm" variant="outline" onClick={() => onPrint(challan)}>
            <Printer /> {challan.status === 'paid' ? 'Print receipt' : 'Print challan'}
          </Button>
        </div>
      }
    >
      <div className="px-4 py-3">
        <FeeItems challan={challan} />
        {challan.status === 'paid' && (
          <p className="mt-3 flex items-center gap-2 rounded-md bg-primary-soft px-3 py-2 text-[13px] text-success">
            <CircleCheck className="size-4 shrink-0" aria-hidden />
            {feeSummary(challan)}
            {challan.bankRef ? ` · bank reference ${challan.bankRef}` : ''}
          </p>
        )}
      </div>
    </Card>
  );
}

/** A student's fee challans: what is owed now, this term's challans, and earlier terms. */
export default function FeesPage() {
  const query = useQuery({ queryKey: keys.myFees, queryFn: api.services.fees });
  const [printing, setPrinting] = useState<FeeChallanDTO | null>(null);
  const data = query.data;
  const currentTerm = data?.challans[0]?.term.id;
  const current = data?.challans.filter((c) => c.term.id === currentTerm) ?? [];
  const earlier = data?.challans.filter((c) => c.term.id !== currentTerm) ?? [];
  const unpaid = current.filter((c) => c.status !== 'paid');
  const overdue = unpaid.some((c) => c.status === 'overdue');

  return (
    <>
      <PageHeader
        title="Fees"
        description="Print a challan, pay it at the bank, and the Accounts Office marks it paid. You're told as soon as they do."
      />
      {!data ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !data.challans.length ? (
        <EmptyState
          icon={Banknote}
          title="No challans yet"
          className="rounded-lg border bg-surface"
        >
          The Accounts Office issues a challan for each term; it appears here and you're told.
        </EmptyState>
      ) : (
        <div className="space-y-5">
          <section
            aria-label="What you owe"
            className={cn(
              'flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border px-4 py-4',
              data.outstanding === 0
                ? 'border-success/25 bg-primary-soft'
                : overdue
                  ? 'border-danger/30 bg-danger-soft'
                  : 'border-warning/30 bg-warning-soft',
            )}
          >
            {data.outstanding === 0 ? (
              <CircleCheck className="size-6 shrink-0 text-success" aria-hidden />
            ) : (
              <CircleAlert
                className={cn('size-6 shrink-0', overdue ? 'text-danger' : 'text-warning')}
                aria-hidden
              />
            )}
            <div className="min-w-[12rem] flex-1">
              <p className="text-[20px] leading-tight font-bold tabular-nums">
                {data.outstanding === 0 ? 'All paid' : `${formatPKR(data.outstanding)} to pay`}
              </p>
              <p className="text-[13.5px] text-muted-foreground">
                {data.outstanding === 0
                  ? 'Nothing to pay right now.'
                  : unpaid
                      .map((c) => `${FEE_INSTALMENT_LABELS[c.instalment]}: ${feeSummary(c)}`)
                      .join(' · ')}
              </p>
            </div>
            {unpaid[0] && (
              <Button className="w-full sm:w-auto" onClick={() => setPrinting(unpaid[0] ?? null)}>
                <Printer /> Print challan
              </Button>
            )}
          </section>

          {current.map((challan) => (
            <ChallanCard key={challan.id} challan={challan} onPrint={setPrinting} />
          ))}

          {earlier.length > 0 && (
            <Card title="Earlier terms">
              <Table>
                <thead>
                  <tr>
                    <th scope="col">Term</th>
                    <th scope="col">Challan</th>
                    <th scope="col" className="text-right">
                      Amount
                    </th>
                    <th scope="col">Paid</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {earlier.map((c) => (
                    <tr key={c.id}>
                      <td className="font-semibold whitespace-nowrap">{challanTitle(c)}</td>
                      <td className="font-mono text-[12.5px] text-muted-foreground">
                        {c.challanNo}
                      </td>
                      <td className="text-right tabular-nums">{formatPKR(c.payable)}</td>
                      <td className="whitespace-nowrap">
                        {c.paidOn ? (
                          formatShortDate(c.paidOn)
                        ) : (
                          <FeeStatusBadge status={c.status} />
                        )}
                      </td>
                      <td className="text-right">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Print ${challanTitle(c)}`}
                          onClick={() => setPrinting(c)}
                        >
                          <Printer />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </div>
      )}
      {printing && <ChallanPrint challan={printing} onDone={() => setPrinting(null)} />}
    </>
  );
}
