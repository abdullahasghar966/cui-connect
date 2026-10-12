/** Pieces shared by the fee pages: status badges, the items list and the printable challan. */
import {
  amountInWords,
  FEE_INSTALMENT_LABELS,
  FEE_PAYMENT_NOTE,
  FEE_STATUS_LABELS,
  type FeeChallanDTO,
  type FeeStatus,
  formatPKR,
  formatShortDate,
} from '@cui/shared';
import { useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';

const TONE: Record<FeeStatus, 'success' | 'warning' | 'danger'> = {
  paid: 'success',
  due: 'warning',
  overdue: 'danger',
};

export function FeeStatusBadge({ status }: { status: FeeStatus }) {
  return <Badge tone={TONE[status]}>{FEE_STATUS_LABELS[status]}</Badge>;
}

const longDate = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** `2026-10-30` → `Fri, 30 Oct 2026`. */
export const formatLongDate = (date: string) => longDate.format(new Date(`${date}T00:00:00Z`));

/** "Fall 2026 · Second instalment". */
export const challanTitle = (c: Pick<FeeChallanDTO, 'term' | 'instalment'>) =>
  `${c.term.name} · ${FEE_INSTALMENT_LABELS[c.instalment]}`;

/** The charges, the total, and what changes after the due date. */
export function FeeItems({ challan }: { challan: FeeChallanDTO }) {
  return (
    <table className="w-full text-[13.5px]">
      <caption className="sr-only">Charges on challan {challan.challanNo}</caption>
      <tbody>
        {challan.items.map((item) => (
          <tr key={item.label} className="border-b last:border-b-0">
            <td className="py-1.5">{item.label}</td>
            <td className="py-1.5 text-right tabular-nums">{formatPKR(item.amount)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-border-strong">
          <th scope="row" className="pt-2 text-left font-bold">
            Total
          </th>
          <td className="pt-2 text-right font-bold tabular-nums">{formatPKR(challan.total)}</td>
        </tr>
        {challan.lateFee > 0 && challan.status !== 'paid' && (
          <tr>
            <th scope="row" className="pt-1 text-left font-normal text-muted-foreground">
              After {formatShortDate(challan.dueDate)} (late fee {formatPKR(challan.lateFee)})
            </th>
            <td className="pt-1 text-right text-muted-foreground tabular-nums">
              {formatPKR(challan.total + challan.lateFee)}
            </td>
          </tr>
        )}
      </tfoot>
    </table>
  );
}

const COPIES = ['Bank copy', 'Accounts Office copy', 'Student copy'] as const;

function ChallanCopy({ challan, copy }: { challan: FeeChallanDTO; copy: string }) {
  const rows: [string, string][] = [
    ['Student', challan.student.name],
    ['Reg. no.', challan.student.regNo ?? '—'],
    [
      'Programme',
      [challan.student.program, challan.student.sectionName].filter(Boolean).join(' · ') || '—',
    ],
    ['Term', challanTitle(challan)],
    ['Due date', formatLongDate(challan.dueDate)],
  ];
  return (
    <section
      aria-label={copy}
      className="flex min-w-0 flex-col border border-black/70 p-3 text-[10.5px] leading-snug"
    >
      <header className="border-b border-black/40 pb-1.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[12px] font-bold">COMSATS University Islamabad</p>
          <span className="shrink-0 border border-black/70 px-1 text-[9px] font-bold uppercase">
            {copy}
          </span>
        </div>
        <p>Islamabad Campus · Accounts Office</p>
        <p className="mt-1 flex justify-between">
          <span className="font-bold">Fee challan</span>
          <span className="font-mono">No. {challan.challanNo}</span>
        </p>
      </header>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 border-b border-black/40 py-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-black/70">{label}</dt>
            <dd className="font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <table className="w-full border-b border-black/40">
        <tbody>
          {challan.items.map((item) => (
            <tr key={item.label}>
              <td className="py-0.5">{item.label}</td>
              <td className="py-0.5 text-right tabular-nums">{formatPKR(item.amount)}</td>
            </tr>
          ))}
          <tr className="border-t border-black/40 font-bold">
            <td className="pt-1">Total payable by the due date</td>
            <td className="pt-1 text-right tabular-nums">{formatPKR(challan.total)}</td>
          </tr>
          {challan.lateFee > 0 && (
            <tr>
              <td className="pb-1">After the due date</td>
              <td className="pb-1 text-right tabular-nums">
                {formatPKR(challan.total + challan.lateFee)}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="py-1.5 italic">{amountInWords(challan.total)}</p>
      {challan.status === 'paid' && challan.paidOn && (
        <p className="mb-1.5 self-start border-2 border-black px-1.5 py-0.5 font-bold uppercase">
          Paid {formatPKR(challan.payable)} on {formatLongDate(challan.paidOn)}
          {challan.bankRef ? ` · ${challan.bankRef}` : ''}
        </p>
      )}
      <p className="text-[9.5px] text-black/70">{FEE_PAYMENT_NOTE}</p>
      <div className="mt-auto grid grid-cols-2 gap-3 pt-6 text-[9.5px]">
        <p className="border-t border-black/60 pt-0.5">Depositor's signature</p>
        <p className="border-t border-black/60 pt-0.5">Bank stamp and signature</p>
      </div>
    </section>
  );
}

/**
 * The bank challan in three copies side by side (bank, Accounts Office, student), shown only
 * when printing. Mounting it opens the print dialog; `onDone` runs once the dialog closes.
 */
export function ChallanPrint({ challan, onDone }: { challan: FeeChallanDTO; onDone: () => void }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    // After the copies are on the page; print() returns once the dialog closes.
    const frame = requestAnimationFrame(() => {
      window.print();
      done.current();
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div data-print className="hidden bg-white text-black print:block">
      <style>{'@page { size: A4 landscape; margin: 8mm; }'}</style>
      <div className="grid grid-cols-3 gap-4">
        {COPIES.map((copy) => (
          <ChallanCopy key={copy} challan={challan} copy={copy} />
        ))}
      </div>
    </div>
  );
}

/** A one-line summary of where a challan stands. */
export function feeSummary(challan: FeeChallanDTO): string {
  if (challan.status === 'paid') {
    return `Paid ${formatPKR(challan.payable)}${challan.paidOn ? ` on ${formatShortDate(challan.paidOn)}` : ''}`;
  }
  if (challan.status === 'overdue') {
    return `Overdue since ${formatShortDate(challan.dueDate)}: ${formatPKR(challan.payable)} with the late fee`;
  }
  return `${formatPKR(challan.payable)} due by ${formatShortDate(challan.dueDate)}`;
}
