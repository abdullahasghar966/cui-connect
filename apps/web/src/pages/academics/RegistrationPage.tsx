import {
  canSubmit,
  checkRegistration,
  MAX_CREDITS,
  type RegistrationDTO,
  type RegistrationHomeDTO,
  type RegistrationOfferDTO,
  type StudentRecordLike,
} from '@cui/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, ListChecks, Search, Send, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, Spinner } from '@/components/feedback';
import { Card, PageHeader, Tabs } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { useCurrentUser } from '@/hooks/queries';
import { errorMessage, useAction } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { cn, formatListTime } from '@/lib/utils';
import { OffersPanel } from './registration-offers';
import {
  AdvisorNote,
  IssueList,
  OfferFacts,
  offerSummary,
  PlanStatusBadge,
  PlanWeek,
  toOfferLike,
  WindowBanner,
  WindowControl,
} from './registration-ui';

/** Students' plan builder, or the approvals and offers of advisors and offices. */
export default function RegistrationPage() {
  const me = useCurrentUser();
  const query = useQuery({ queryKey: keys.registrationHome, queryFn: api.registration.home });
  const home = query.data;
  return (
    <>
      <PageHeader
        title="Course registration"
        description={
          me.role === 'student'
            ? `Choose your courses for ${home?.term.name ?? 'next term'}. Your batch advisor approves the plan.`
            : `${home?.term.name ?? 'Next term'}: the courses on offer, and the plans students send.`
        }
        actions={home?.window.canChange && <WindowControl window={home.window} />}
      />
      {!home ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <>
          <WindowBanner window={home.window} termName={home.term.name} />
          {me.role === 'student' ? <PlanBuilder home={home} /> : <StaffView home={home} />}
        </>
      )}
    </>
  );
}

// ---- Students ----

function PlanBuilder({ home }: { home: RegistrationHomeDTO }) {
  const qc = useQueryClient();
  const reg = home.registration;
  const status = reg?.status ?? 'draft';
  const editable = home.window.open && (status === 'draft' || status === 'returned');
  const [selected, setSelected] = useState<string[]>(() => reg?.offers.map((o) => o.id) ?? []);
  // The server's plan wins when its state changes (sent, approved, returned).
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only on a new plan or status
  useEffect(() => {
    setSelected(reg?.offers.map((o) => o.id) ?? []);
  }, [reg?.id, reg?.status]);

  const byId = new Map(home.offers.map((o) => [o.id, o]));
  const chosen = selected.flatMap((id) => byId.get(id) ?? []);
  const held = status === 'submitted' || status === 'approved' ? selected : [];
  const { credits, issues } = checkRegistration(
    chosen.map(toOfferLike),
    home.record ?? { passed: [], inProgress: [] },
    held,
  );

  const setRegistration = (registration: RegistrationDTO) =>
    qc.setQueryData<RegistrationHomeDTO>(keys.registrationHome, (h) => h && { ...h, registration });
  // Saves run one at a time, so quick clicks can't arrive out of order.
  const save = useMutation({
    mutationFn: (ids: string[]) => api.registration.savePlan(ids),
    scope: { id: 'registration-plan' },
    onSuccess: setRegistration,
    onError: (err) => {
      toast.error(errorMessage(err));
      void qc.invalidateQueries({ queryKey: keys.registration });
    },
  });
  const change = (next: string[]) => {
    setSelected(next);
    save.mutate(next);
  };
  const toggle = (id: string) =>
    change(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const submit = useAction(() => api.registration.submitPlan(), {
    done: (r) => `Sent to ${r.handledBy}`,
    invalidate: [keys.registration],
  });
  const withdraw = useAction(() => api.registration.withdrawPlan(), {
    done: 'Plan taken back. Change it and send it again.',
    invalidate: [keys.registration],
  });

  const mine = home.offers.filter((o) => o.section.id === home.sectionId);
  const notAdded = mine.filter((o) => !selected.includes(o.id));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section aria-label="Your plan" className="min-w-0 space-y-5 lg:order-2 lg:sticky lg:top-4">
        <Card
          title="Your plan"
          description={reg ? `To ${reg.handledBy}` : 'Add courses from the offers.'}
          actions={<PlanStatusBadge status={status} />}
        >
          <div className="space-y-3 px-4 py-3">
            {reg && <AdvisorNote registration={reg} />}
            <div>
              <div className="mb-1 flex justify-between text-[13px]">
                <span className="font-semibold">Credit hours</span>
                <span className="tabular-nums">
                  {credits} / {MAX_CREDITS}
                </span>
              </div>
              {/* The numbers above say the same for screen readers. */}
              <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div
                  className={cn(
                    'h-full rounded-full',
                    credits > MAX_CREDITS
                      ? 'bg-danger'
                      : credits < 12
                        ? 'bg-warning'
                        : 'bg-primary',
                  )}
                  style={{ width: `${Math.min(100, (credits / MAX_CREDITS) * 100)}%` }}
                />
              </div>
            </div>
            {chosen.length > 0 && (
              <ul className="divide-y rounded-md border" aria-label="Courses in your plan">
                {chosen.map((offer) => (
                  <li key={offer.id} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                    <span className="min-w-0 flex-1">
                      <span className="font-mono text-[12px] text-muted-foreground">
                        {offer.code}
                      </span>{' '}
                      <span className="font-semibold">{offer.title}</span>
                      <span className="block text-[12px] text-muted-foreground">
                        {offer.section.name} · {offer.credits} cr
                      </span>
                    </span>
                    {editable && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove ${offer.code} (${offer.section.name})`}
                        onClick={() => toggle(offer.id)}
                      >
                        Remove
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {(chosen.length > 0 || reg) && <IssueList issues={issues} />}
            {editable && (
              <Button
                className="w-full"
                disabled={!chosen.length || !canSubmit(issues) || save.isPending}
                loading={submit.isPending}
                onClick={() => submit.mutate(undefined)}
              >
                <Send /> Send to my batch advisor
              </Button>
            )}
            {status === 'submitted' && home.window.open && (
              <Button
                variant="outline"
                className="w-full"
                loading={withdraw.isPending}
                onClick={() => withdraw.mutate(undefined)}
              >
                <Undo2 /> Take it back to change
              </Button>
            )}
          </div>
        </Card>
      </section>

      <div className="min-w-0 space-y-5 lg:order-1">
        <OfferBrowser
          home={home}
          selected={selected}
          editable={editable}
          onToggle={toggle}
          onAddMine={
            notAdded.length && editable
              ? () => change([...selected, ...notAdded.map((o) => o.id)])
              : null
          }
          held={held}
        />
        <Card title="Your week">
          <div className="p-2">
            <PlanWeek offers={chosen} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function OfferBrowser({
  home,
  selected,
  editable,
  held,
  onToggle,
  onAddMine,
}: {
  home: RegistrationHomeDTO;
  selected: string[];
  editable: boolean;
  held: string[];
  onToggle: (id: string) => void;
  onAddMine: (() => void) | null;
}) {
  const sectionName = home.offers.find((o) => o.section.id === home.sectionId)?.section.name;
  const [tab, setTab] = useState<'mine' | 'all'>(sectionName ? 'mine' : 'all');
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const offers = home.offers
    .filter((o) => tab === 'all' || o.section.id === home.sectionId)
    .filter(
      (o) =>
        !needle ||
        o.code.toLowerCase().includes(needle) ||
        o.title.toLowerCase().includes(needle) ||
        (o.instructor?.name.toLowerCase().includes(needle) ?? false),
    );
  return (
    <Card
      title={`Offered for ${home.term.name}`}
      actions={
        onAddMine && (
          <Button size="sm" variant="outline" onClick={onAddMine}>
            Add all for {sectionName}
          </Button>
        )
      }
    >
      <div className="px-4 pt-3">
        <Tabs
          label="Offers"
          value={tab}
          onChange={setTab}
          options={[
            ...(sectionName ? [{ value: 'mine' as const, label: `For ${sectionName}` }] : []),
            { value: 'all' as const, label: 'All courses', count: home.offers.length },
          ]}
          className="mb-3"
        />
        {tab === 'all' && (
          <div className="relative mb-3">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              aria-label="Search offers"
              placeholder="Course code, title or teacher"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-8"
            />
          </div>
        )}
      </div>
      {!offers.length ? (
        <p className="px-4 pb-6 text-[13.5px] text-muted-foreground">
          {home.offers.length
            ? 'No courses match.'
            : `Courses for ${home.term.name} haven't been offered yet.`}
        </p>
      ) : (
        <ul className="divide-y border-t">
          {offers.map((offer) => (
            <OfferRow
              key={offer.id}
              offer={offer}
              added={selected.includes(offer.id)}
              disabled={
                !editable ||
                (!selected.includes(offer.id) && offer.seatsLeft === 0 && !held.includes(offer.id))
              }
              record={home.record}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function OfferRow({
  offer,
  added,
  disabled,
  record,
  onToggle,
}: {
  offer: RegistrationOfferDTO;
  added: boolean;
  disabled: boolean;
  record: StudentRecordLike | null;
  onToggle: (id: string) => void;
}) {
  return (
    <li className={cn('flex items-start gap-3 px-4 py-3', added && 'bg-primary-soft/40')}>
      <div className="min-w-0 flex-1">
        <p className="text-[14px]">
          <span className="font-mono text-[12.5px] text-muted-foreground">{offer.code}</span>{' '}
          <span className="font-semibold">{offer.title}</span>{' '}
          <span className="text-[12.5px] text-muted-foreground">· {offer.section.name}</span>
        </p>
        <p className="text-[12.5px] text-muted-foreground">{offerSummary(offer)}</p>
        <OfferFacts offer={offer} record={record} />
      </div>
      <Button
        size="sm"
        variant={added ? 'outline' : 'primary'}
        disabled={disabled}
        aria-label={`${added ? 'Remove' : 'Add'} ${offer.code} (${offer.section.name})`}
        aria-pressed={added}
        onClick={() => onToggle(offer.id)}
      >
        {added ? 'Added' : 'Add'}
      </Button>
    </li>
  );
}

// ---- Advisors, offices, IT ----

function StaffView({ home }: { home: RegistrationHomeDTO }) {
  const me = useCurrentUser();
  const approves = me.role === 'faculty' || (me.role === 'staff' && me.office === 'DEPARTMENT');
  const [params, setParams] = useSearchParams();
  const tab = approves && params.get('tab') !== 'offers' ? 'approvals' : 'offers';
  return (
    <>
      {approves && (
        <Tabs
          label="Registration"
          value={tab}
          onChange={(value) =>
            setParams(value === 'approvals' ? {} : { tab: value }, { replace: true })
          }
          options={[
            { value: 'approvals', label: 'Plans to approve', count: home.waiting },
            { value: 'offers', label: 'Offers', count: home.offers.length },
          ]}
        />
      )}
      {tab === 'approvals' ? <Approvals /> : <OffersPanel home={home} />}
    </>
  );
}

function Approvals() {
  const query = useQuery({
    queryKey: keys.registrationApprovals,
    queryFn: api.registration.approvals,
  });
  if (!query.data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (!query.data.length) {
    return (
      <EmptyState icon={ListChecks} title="No plans yet" className="rounded-lg border bg-surface">
        Plans from the students you advise appear here, and you're told as each one arrives.
      </EmptyState>
    );
  }
  return (
    <Card>
      <ul className="divide-y">
        {query.data.map((r) => {
          const blocks = r.issues.filter((i) => i.level === 'block').length;
          const warnings = r.issues.length - blocks;
          return (
            <li key={r.id}>
              <Link
                to={`/academics/registration/${r.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{r.student.name}</span>
                  <span className="text-[12.5px] text-muted-foreground">
                    {[r.student.regNo, r.student.sectionName].filter(Boolean).join(' · ')} ·{' '}
                    {r.offers.length} courses, {r.credits} credit hours
                    {warnings ? ` · ${warnings} note${warnings === 1 ? '' : 's'}` : ''}
                    {blocks ? ` · ${blocks} problem${blocks === 1 ? '' : 's'}` : ''} · updated{' '}
                    {formatListTime(r.updatedAt)}
                  </span>
                </span>
                <PlanStatusBadge status={r.status} />
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
