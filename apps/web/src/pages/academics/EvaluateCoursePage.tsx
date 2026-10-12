import { EVALUATION_QUESTIONS, evaluationSchema, LIKERT_LABELS } from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ShieldCheck, Star } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { EmptyState, Spinner } from '@/components/feedback';
import { Card, PageHeader } from '@/components/page';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/form';
import { useSubmit } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { cn } from '@/lib/utils';

/** The questionnaire for one course: eight ratings and two optional comments. */
export default function EvaluateCoursePage() {
  const { offeringId = '' } = useParams();
  const navigate = useNavigate();
  const query = useQuery({ queryKey: keys.evaluation, queryFn: api.evaluation.home });
  const course = query.data?.courses.find((c) => c.offeringId === offeringId);
  const [ratings, setRatings] = useState<(number | null)[]>(() =>
    EVALUATION_QUESTIONS.map(() => null),
  );
  const [wentWell, setWentWell] = useState('');
  const [improve, setImprove] = useState('');
  const send = useSubmit(evaluationSchema, (input) => api.evaluation.submit(offeringId, input), {
    done: 'Thank you. Your answers were saved without your name.',
    invalidate: [keys.evaluation],
  });
  const answered = ratings.filter((r) => r !== null).length;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    send.run(
      {
        ratings: ratings.map((r) => r ?? 0),
        wentWell: wentWell.trim() || null,
        improve: improve.trim() || null,
      },
      () => navigate('/academics/evaluation'),
    );
  };

  const back = (
    <Link
      to="/academics/evaluation"
      className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-link hover:underline"
    >
      <ArrowLeft className="size-3.5" aria-hidden /> Teacher evaluation
    </Link>
  );
  if (!query.data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (!course || course.done || !query.data.open) {
    return (
      <>
        {back}
        <EmptyState icon={Star} title="Nothing to fill in here">
          {course?.done
            ? 'You have already evaluated this course. Thank you.'
            : !query.data.open
              ? 'Teacher evaluation is closed.'
              : 'This is not one of your courses this term.'}
        </EmptyState>
      </>
    );
  }
  return (
    <>
      {back}
      <PageHeader
        title={`${course.code} ${course.title}`}
        description={`${course.teacher?.name ?? 'Teacher'} · ${course.sectionName} · ${query.data.term.name}`}
      />
      <p className="mb-5 flex items-start gap-2 rounded-lg border border-primary/25 bg-primary-soft px-3 py-2.5 text-[13.5px]">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        Anonymous: your answers are saved without your name, and your teacher sees only totals and
        comments after evaluation closes.
      </p>
      <form onSubmit={submit} className="max-w-3xl space-y-5">
        <Card
          title="Your ratings"
          description={`${answered} of ${EVALUATION_QUESTIONS.length} answered`}
        >
          <ol className="divide-y">
            {EVALUATION_QUESTIONS.map((q, index) => (
              <li key={q.id} className="px-4 py-3">
                <fieldset>
                  <legend className="mb-2 text-[14px] font-semibold">
                    {index + 1}. {q.text}
                  </legend>
                  <div className="grid grid-cols-5 gap-1.5">
                    {LIKERT_LABELS.map((label, i) => {
                      const value = i + 1;
                      const on = ratings[index] === value;
                      return (
                        <label
                          key={label}
                          className={cn(
                            'flex cursor-pointer flex-col items-center gap-0.5 rounded-md border px-1 py-1.5 text-center text-[11.5px] leading-tight transition-colors',
                            on
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'hover:bg-surface-2',
                          )}
                        >
                          <input
                            type="radio"
                            name={q.id}
                            value={value}
                            checked={on}
                            className="sr-only"
                            onChange={() =>
                              setRatings((list) => list.map((r, j) => (j === index ? value : r)))
                            }
                          />
                          <span className="text-[15px] font-bold">{value}</span>
                          <span className={cn(!on && 'text-muted-foreground')}>{label}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </li>
            ))}
          </ol>
        </Card>
        <Card title="In your own words (optional)">
          <div className="space-y-3 px-4 py-3">
            <Field label="What went well?" htmlFor="eval-well">
              <Textarea
                id="eval-well"
                rows={3}
                maxLength={1000}
                value={wentWell}
                onChange={(e) => setWentWell(e.target.value)}
              />
            </Field>
            <Field
              label="What could be better?"
              htmlFor="eval-improve"
              hint="Avoid details that could identify you."
            >
              <Textarea
                id="eval-improve"
                rows={3}
                maxLength={1000}
                value={improve}
                onChange={(e) => setImprove(e.target.value)}
              />
            </Field>
          </div>
        </Card>
        <div className="flex justify-end gap-2">
          <Link to="/academics/evaluation" className={buttonVariants({ variant: 'outline' })}>
            Cancel
          </Link>
          <Button
            type="submit"
            loading={send.pending}
            disabled={answered < EVALUATION_QUESTIONS.length}
          >
            Send anonymously
          </Button>
        </div>
      </form>
    </>
  );
}
