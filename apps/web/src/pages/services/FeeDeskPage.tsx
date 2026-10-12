import {
  addDays,
  amountOn,
  campusClock,
  FEE_DESK_FILTERS,
  FEE_INSTALMENT_LABELS,
  FEE_INSTALMENTS,
  type FeeChallanDTO,
  type FeeDeskFilter,
  type FeeInstalment,
  feeItemsFor,
  feeTotal,
  formatPKR,
  formatShortDate,
  issueChallansSchema,
  LATE_FEE,
  markPaidSchema,
} from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { Banknote, Ellipsis, Plus, Printer, Search, Trash2, Undo2, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useSearchParams } from 'react-router';
import { EmptyState, Spinner } from '@/components/feedback';
import { Card, PageHeader, Stat, StatStrip, Table, Tabs } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/menu';
import { useDebounced } from '@/hooks/useDebounced';
import { useAction, useSubmit } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { ChallanPrint, FeeStatusBadge } from './fees-ui';

const FILTER_LABELS: Record<FeeDeskFilter, string> = {
  all: 'All',
  unpaid: 'Unpaid',
  overdue: 'Overdue',
  paid: 'Paid',
};

function useDepartmentsAndSections() {
  const departments = useQuery({
    queryKey: keys.departments,
    queryFn: api.academics.departments,
  });
  const sections = useQuery({ queryKey: keys.sections, queryFn: api.academics.sections });
  return { departments: departments.data ?? [], sections: sections.data ?? [] };
}

/** Records a payment from the bank's copy; the late fee is added when paid after the due date. */
function MarkPaidDialog({ challan, onClose }: { challan: FeeChallanDTO; onClose: () => void }) {
  const today = campusClock().date;
  const [paidOn, setPaidOn] = useState(today);
  const [bankRef, setBankRef] = useState('');
  const save = useSubmit(markPaidSchema, (input) => api.services.markPaid(challan.id, input), {
    done: (c) => `${c.student.name}: ${formatPKR(c.payable)} received`,
    invalidate: [keys.fees],
  });
  const amount = amountOn(challan, paidOn || today);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.run({ paidOn, bankRef: bankRef.trim() || null }, onClose);
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={`Record payment: ${challan.student.name}`}
        description={`${challan.term.name} ${FEE_INSTALMENT_LABELS[challan.instalment].toLowerCase()}, challan ${challan.challanNo}. The student is told at once.`}
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Paid on" htmlFor="fee-paid-on" hint="The date on the bank's stamp">
              <Input
                id="fee-paid-on"
                type="date"
                max={today}
                value={paidOn}
                onChange={(e) => setPaidOn(e.target.value)}
              />
            </Field>
            <Field label="Bank reference (optional)" htmlFor="fee-bank-ref">
              <Input
                id="fee-bank-ref"
                value={bankRef}
                onChange={(e) => setBankRef(e.target.value)}
                placeholder="e.g. BR-512094"
              />
            </Field>
          </div>
          <p className="rounded-md bg-surface-2 px-3 py-2 text-[13.5px]">
            Amount received: <span className="font-bold tabular-nums">{formatPKR(amount)}</span>
            {amount > challan.total && (
              <span className="text-muted-foreground">
                {' '}
                (includes the {formatPKR(challan.lateFee)} late fee: paid after{' '}
                {formatShortDate(challan.dueDate)})
              </span>
            )}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.pending}>
              Mark paid
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Scope = 'campus' | 'department' | 'section';

/** One challan for every active student in the chosen part of the campus. */
function IssueChallansDialog({ onClose }: { onClose: () => void }) {
  const { departments, sections } = useDepartmentsAndSections();
  const [scope, setScope] = useState<Scope>('campus');
  const [departmentId, setDepartmentId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [instalment, setInstalment] = useState<FeeInstalment>('full');
  const [dueDate, setDueDate] = useState(addDays(campusClock().date, 14));
  const [lateFee, setLateFee] = useState(String(LATE_FEE));
  const [items, setItems] = useState(() =>
    feeItemsFor('full').map((i) => ({ label: i.label, amount: String(i.amount) })),
  );
  const issue = useSubmit(issueChallansSchema, (input) => api.services.issueChallans(input), {
    done: (r) =>
      `Issued ${r.issued} challan${r.issued === 1 ? '' : 's'}${r.skipped ? ` (${r.skipped} already had one)` : ''}`,
    invalidate: [keys.fees],
  });
  const parsedItems = items.map((i) => ({ label: i.label, amount: Number(i.amount || 0) }));
  const pickInstalment = (value: FeeInstalment) => {
    setInstalment(value);
    setItems(feeItemsFor(value).map((i) => ({ label: i.label, amount: String(i.amount) })));
  };
  const setItem = (index: number, field: 'label' | 'amount', value: string) =>
    setItems((list) => list.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    issue.run(
      {
        instalment,
        scope,
        departmentId: scope === 'department' ? departmentId || null : null,
        sectionId: scope === 'section' ? sectionId || null : null,
        dueDate,
        items: parsedItems,
        lateFee: Number(lateFee || 0),
      },
      onClose,
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        wide
        title="Issue challans"
        description="Each active student gets one for this term and is told at once. Students who already have this challan are skipped, so running it twice is safe."
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Who" htmlFor="issue-scope">
              <Select
                id="issue-scope"
                value={scope}
                onChange={(e) => setScope(e.target.value as Scope)}
              >
                <option value="campus">Every student on campus</option>
                <option value="department">One department</option>
                <option value="section">One section</option>
              </Select>
            </Field>
            {scope === 'department' && (
              <Field label="Department" htmlFor="issue-department">
                <Select
                  id="issue-department"
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                >
                  <option value="">Choose…</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {scope === 'section' && (
              <Field label="Section" htmlFor="issue-section">
                <Select
                  id="issue-section"
                  value={sectionId}
                  onChange={(e) => setSectionId(e.target.value)}
                >
                  <option value="">Choose…</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Challan" htmlFor="issue-instalment">
              <Select
                id="issue-instalment"
                value={instalment}
                onChange={(e) => pickInstalment(e.target.value as FeeInstalment)}
              >
                {FEE_INSTALMENTS.map((i) => (
                  <option key={i} value={i}>
                    {FEE_INSTALMENT_LABELS[i]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due date" htmlFor="issue-due">
              <Input
                id="issue-due"
                type="date"
                min={campusClock().date}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </Field>
            <Field label="Late fee (Rs)" htmlFor="issue-late">
              <Input
                id="issue-late"
                type="number"
                min={0}
                step={100}
                value={lateFee}
                onChange={(e) => setLateFee(e.target.value)}
              />
            </Field>
          </div>

          <fieldset className="rounded-lg border">
            <legend className="sr-only">Charges</legend>
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-[13px] font-semibold">Charges</span>
              <span className="text-[13px] text-muted-foreground">
                Total per student:{' '}
                <span className="font-bold text-foreground tabular-nums">
                  {formatPKR(feeTotal(parsedItems))}
                </span>
              </span>
            </div>
            <ul className="divide-y">
              {items.map((item, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: rows are edited in place
                <li key={index} className="flex items-center gap-2 px-3 py-1.5">
                  <Input
                    aria-label={`Charge ${index + 1}`}
                    value={item.label}
                    onChange={(e) => setItem(index, 'label', e.target.value)}
                    className="h-8 flex-1"
                  />
                  <Input
                    aria-label={`Amount of charge ${index + 1}`}
                    type="number"
                    min={0}
                    value={item.amount}
                    onChange={(e) => setItem(index, 'amount', e.target.value)}
                    className="h-8 w-28 text-right tabular-nums"
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${item.label || `charge ${index + 1}`}`}
                    disabled={items.length === 1}
                    onClick={() => setItems((list) => list.filter((_, i) => i !== index))}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
            <div className="border-t px-3 py-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={items.length >= 15}
                onClick={() => setItems((list) => [...list, { label: '', amount: '0' }])}
              >
                <Plus /> Add charge
              </Button>
            </div>
          </fieldset>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={issue.pending}>
              Issue challans
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Asks before undoing a payment or withdrawing a challan. */
function ConfirmDialog({
  challan,
  action,
  onClose,
}: {
  challan: FeeChallanDTO;
  action: 'unpaid' | 'withdraw';
  onClose: () => void;
}) {
  const run = useAction(
    async () => {
      if (action === 'unpaid') await api.services.markUnpaid(challan.id);
      else await api.services.cancelChallan(challan.id);
    },
    {
      done: action === 'unpaid' ? 'Marked as unpaid' : 'Challan withdrawn',
      invalidate: [keys.fees],
    },
  );
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={
          action === 'unpaid'
            ? `Mark ${challan.student.name}'s challan as unpaid?`
            : `Withdraw ${challan.student.name}'s challan?`
        }
        description={
          action === 'unpaid'
            ? 'Use this only if the payment was recorded by mistake. The student is told.'
            : "For a challan issued by mistake. The student is told they don't need to pay it."
        }
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={run.isPending}
            onClick={() => run.mutate(undefined, { onSuccess: onClose })}
          >
            {action === 'unpaid' ? 'Mark as unpaid' : 'Withdraw challan'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface RowActions {
  onPay: (c: FeeChallanDTO) => void;
  onConfirm: (c: FeeChallanDTO, action: 'unpaid' | 'withdraw') => void;
  onPrint: (c: FeeChallanDTO) => void;
}

/** "Mark paid" for unpaid challans, and a menu to print, undo a payment or withdraw. */
function ChallanActions({
  challan: c,
  onPay,
  onConfirm,
  onPrint,
}: RowActions & { challan: FeeChallanDTO }) {
  return (
    <div className="flex items-center justify-end gap-1">
      {c.status !== 'paid' && (
        <Button
          size="sm"
          variant="outline"
          aria-label={`Mark paid: ${c.student.name}, ${FEE_INSTALMENT_LABELS[c.instalment].toLowerCase()}`}
          onClick={() => onPay(c)}
        >
          Mark paid
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for challan ${c.challanNo}`}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => onPrint(c)}>
            <Printer /> Print challan
          </DropdownMenuItem>
          {c.status === 'paid' ? (
            <DropdownMenuItem danger onSelect={() => onConfirm(c, 'unpaid')}>
              <Undo2 /> Mark as unpaid
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem danger onSelect={() => onConfirm(c, 'withdraw')}>
              <Trash2 /> Withdraw challan
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** The Accounts Office's view of this term's challans: totals, filters and payments. */
export default function FeeDeskPage() {
  const [params, setParams] = useSearchParams();
  const status = (FEE_DESK_FILTERS as readonly string[]).includes(params.get('status') ?? '')
    ? (params.get('status') as FeeDeskFilter)
    : 'all';
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const [departmentId, setDepartmentId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [instalment, setInstalment] = useState('');
  const { departments, sections } = useDepartmentsAndSections();
  const department = departments.find((d) => d.id === departmentId);
  const shownSections = department
    ? sections.filter((s) => s.departmentCode === department.code)
    : sections;

  const filters = { status, q, departmentId, sectionId, instalment };
  const query = useQuery({
    queryKey: keys.feeDesk(filters),
    queryFn: () => api.services.feeDesk(filters),
    placeholderData: (previous) => previous,
  });
  const [issuing, setIssuing] = useState(false);
  const [paying, setPaying] = useState<FeeChallanDTO | null>(null);
  const [confirm, setConfirm] = useState<{
    challan: FeeChallanDTO;
    action: 'unpaid' | 'withdraw';
  } | null>(null);
  const [printing, setPrinting] = useState<FeeChallanDTO | null>(null);
  const actions: RowActions = {
    onPay: setPaying,
    onConfirm: (challan, action) => setConfirm({ challan, action }),
    onPrint: setPrinting,
  };
  const data = query.data;
  const counts: Record<FeeDeskFilter, number> | null = data
    ? {
        all: data.stats.challans,
        unpaid: data.stats.due + data.stats.overdue,
        overdue: data.stats.overdue,
        paid: data.stats.paid,
      }
    : null;

  return (
    <>
      <PageHeader
        title="Fee desk"
        description={`${data?.term.name ?? 'This term'}'s challans. Record each payment when the bank's copy arrives; the student is told at once.`}
        actions={
          <Button onClick={() => setIssuing(true)}>
            <Plus /> Issue challans
          </Button>
        }
      />
      {data && (
        <StatStrip className="mb-5 sm:grid-cols-3 xl:grid-cols-6">
          <Stat label="Challans" value={data.stats.challans} />
          <Stat label="Paid" value={data.stats.paid} />
          <Stat label="Due" value={data.stats.due} />
          <Stat label="Overdue" value={data.stats.overdue} />
          <Stat label="Collected" value={formatPKR(data.stats.collected)} />
          <Stat
            label="Outstanding"
            value={formatPKR(data.stats.outstanding)}
            hint="With late fees, as of today"
          />
        </StatStrip>
      )}

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto]">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Search challans"
            placeholder="Name, reg. no. or challan no."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select
          aria-label="Department"
          value={departmentId}
          onChange={(e) => {
            setDepartmentId(e.target.value);
            setSectionId('');
          }}
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Section"
          value={sectionId}
          onChange={(e) => setSectionId(e.target.value)}
        >
          <option value="">All sections</option>
          {shownSections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Challan"
          value={instalment}
          onChange={(e) => setInstalment(e.target.value)}
        >
          <option value="">All challans</option>
          {FEE_INSTALMENTS.map((i) => (
            <option key={i} value={i}>
              {FEE_INSTALMENT_LABELS[i]}
            </option>
          ))}
        </Select>
      </div>

      <Tabs
        label="Status"
        value={status}
        onChange={(value) => setParams(value === 'all' ? {} : { status: value }, { replace: true })}
        options={FEE_DESK_FILTERS.map((value) => ({
          value,
          label: FILTER_LABELS[value],
          count: counts?.[value],
        }))}
      />

      {!data ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !data.rows.length ? (
        <EmptyState
          icon={Banknote}
          title="No challans here"
          className="rounded-lg border bg-surface"
        >
          {data.stats.challans
            ? 'Nothing matches these filters.'
            : 'Issue challans for this term to start collecting fees.'}
        </EmptyState>
      ) : (
        <Card>
          {/* Phones: one card-like row per challan instead of a wide table. */}
          <ul className="divide-y sm:hidden">
            {data.rows.map((c) => (
              <li key={c.id} className="flex items-start gap-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{c.student.name}</p>
                  <p className="text-[12.5px] text-muted-foreground">
                    {[c.student.regNo, c.student.sectionName].filter(Boolean).join(' · ')}
                  </p>
                  <p className="mt-1 truncate text-[12.5px] text-muted-foreground">
                    <span className="font-mono text-foreground">{c.challanNo}</span> ·{' '}
                    {FEE_INSTALMENT_LABELS[c.instalment]}
                  </p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                    <span className="font-semibold tabular-nums">{formatPKR(c.payable)}</span>
                    <FeeStatusBadge status={c.status} />
                    <span className="text-muted-foreground">
                      {c.paidOn
                        ? `on ${formatShortDate(c.paidOn)}`
                        : `due ${formatShortDate(c.dueDate)}`}
                    </span>
                  </p>
                </div>
                <ChallanActions challan={c} {...actions} />
              </li>
            ))}
          </ul>
          <div className="hidden sm:block">
            <Table>
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col">Section</th>
                  <th scope="col">Challan</th>
                  <th scope="col" className="text-right">
                    Amount
                  </th>
                  <th scope="col">Due</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className="block font-semibold whitespace-nowrap">
                        {c.student.name}
                      </span>
                      <span className="text-[12px] text-muted-foreground">{c.student.regNo}</span>
                    </td>
                    <td className="whitespace-nowrap">{c.student.sectionName ?? '—'}</td>
                    <td>
                      <span className="block font-mono text-[12px] whitespace-nowrap">
                        {c.challanNo}
                      </span>
                      <span className="text-[12px] text-muted-foreground">
                        {FEE_INSTALMENT_LABELS[c.instalment]}
                      </span>
                    </td>
                    <td className="text-right whitespace-nowrap tabular-nums">
                      {formatPKR(c.payable)}
                      {c.payable > c.total && (
                        <span className="block text-[11.5px] text-muted-foreground">
                          incl. late fee
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap">{formatShortDate(c.dueDate)}</td>
                    <td className="whitespace-nowrap">
                      <FeeStatusBadge status={c.status} />
                      {c.paidOn && (
                        <span className="ml-1.5 text-[12px] text-muted-foreground">
                          {formatShortDate(c.paidOn)}
                        </span>
                      )}
                    </td>
                    <td>
                      <ChallanActions challan={c} {...actions} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
          {data.truncated && (
            <p className="border-t px-4 py-2 text-[12.5px] text-muted-foreground">
              Showing the first {data.rows.length}. Narrow the list with the filters above.
            </p>
          )}
        </Card>
      )}

      {issuing && <IssueChallansDialog onClose={() => setIssuing(false)} />}
      {paying && <MarkPaidDialog challan={paying} onClose={() => setPaying(null)} />}
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
      {printing && <ChallanPrint challan={printing} onDone={() => setPrinting(null)} />}
    </>
  );
}
