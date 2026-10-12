import { describeSlots, formatCredits, registrationReturnSchema } from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, ListChecks, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { EmptyState, Spinner } from '@/components/feedback';
import { Card, PageHeader, Table } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/form';
import { useAction, useSubmit } from '@/hooks/useSubmit';
import { ApiError, api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { IssueList, PlanStatusBadge, PlanTimeline, PlanWeek } from './registration-ui';

/** A student's plan as their batch advisor sees it: courses, checks, week and the decision. */
export default function RegistrationReviewPage() {
  const { registrationId = '' } = useParams();
  const query = useQuery({
    queryKey: keys.registrationDetail(registrationId),
    queryFn: () => api.registration.detail(registrationId),
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
  });
  const [note, setNote] = useState('');
  const approve = useAction(
    () => api.registration.approvePlan(registrationId, note.trim() || null),
    {
      done: (r) => `Approved ${r.student.name}'s plan`,
      invalidate: [keys.registration],
    },
  );
  const sendBack = useSubmit(
    registrationReturnSchema,
    (input) => api.registration.returnPlan(registrationId, input.note),
    { done: (r) => `Returned to ${r.student.name}`, invalidate: [keys.registration] },
  );
  const reg = query.data;

  const back = (
    <Link
      to="/academics/registration"
      className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-link hover:underline"
    >
      <ArrowLeft className="size-3.5" aria-hidden /> Plans to approve
    </Link>
  );
  if (query.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (!reg) {
    return (
      <>
        {back}
        <EmptyState icon={ListChecks} title="Can't open this plan">
          {query.error instanceof ApiError ? query.error.message : 'Try again in a moment.'}
        </EmptyState>
      </>
    );
  }
  const decide = reg.canHandle && reg.status === 'submitted';
  const reopen = reg.canHandle && reg.status === 'approved';
  return (
    <>
      {back}
      <PageHeader
        title={`${reg.student.name}: ${reg.term.name} plan`}
        description={[
          reg.student.regNo,
          reg.student.sectionName,
          `${reg.offers.length} courses`,
          `${reg.credits} credit hours`,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={<PlanStatusBadge status={reg.status} />}
      />
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Card title="Courses">
            <Table>
              <thead>
                <tr>
                  <th scope="col">Course</th>
                  <th scope="col">Section</th>
                  <th scope="col">Teacher</th>
                  <th scope="col">Weekly meetings</th>
                </tr>
              </thead>
              <tbody>
                {reg.offers.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <span className="font-mono text-[12px] text-muted-foreground">{o.code}</span>{' '}
                      <span className="font-semibold">{o.title}</span>
                      <span className="block text-[12px] text-muted-foreground">
                        {formatCredits(o.credits, o.labCredits)} credit hours
                      </span>
                    </td>
                    <td className="whitespace-nowrap">{o.section.name}</td>
                    <td className="whitespace-nowrap">{o.instructor?.name ?? 'To be announced'}</td>
                    <td className="text-[13px]">{describeSlots(o.slots)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
          <Card
            title="Checks"
            description="Prerequisites, passed courses, clashes, seats and credit hours."
          >
            <div className="px-4 py-3">
              <IssueList issues={reg.issues} />
            </div>
          </Card>
          <Card title="Week">
            <div className="p-2">
              <PlanWeek offers={reg.offers} />
            </div>
          </Card>
        </div>
        <div className="space-y-5 lg:sticky lg:top-4">
          {(decide || reopen) && (
            <Card title={decide ? 'Your decision' : 'Need changes?'}>
              <div className="space-y-3 px-4 py-3">
                <Field
                  label={decide ? 'Note to the student' : 'What should change?'}
                  htmlFor="plan-note"
                  hint={decide ? 'Optional when approving; needed when returning it.' : undefined}
                >
                  <Textarea
                    id="plan-note"
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </Field>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    loading={sendBack.pending}
                    onClick={() => sendBack.run({ note }, () => setNote(''))}
                  >
                    <Undo2 /> Return for changes
                  </Button>
                  {decide && (
                    <Button
                      loading={approve.isPending}
                      onClick={() => approve.mutate(undefined, { onSuccess: () => setNote('') })}
                    >
                      <Check /> Approve
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          )}
          <Card title="History" description={`Sent to ${reg.handledBy}`}>
            <div className="px-4 py-3">
              <PlanTimeline events={reg.events} />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
