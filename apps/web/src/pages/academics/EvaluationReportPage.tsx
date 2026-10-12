import { LIKERT_LABELS, type QuestionSummary } from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, EyeOff, Star } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { EmptyState, Spinner } from '@/components/feedback';
import { Card, PageHeader, Stat, StatStrip } from '@/components/page';
import { ApiError, api } from '@/lib/api';
import { keys } from '@/lib/cache';

/** Colours from "strongly disagree" to "strongly agree". */
const SHADES = ['bg-danger', 'bg-warning', 'bg-border-strong', 'bg-primary/60', 'bg-primary'];

function QuestionRow({ index, question }: { index: number; question: QuestionSummary }) {
  const total = question.counts.reduce((sum, n) => sum + n, 0) || 1;
  return (
    <li className="px-4 py-3">
      <div className="mb-1.5 flex items-start justify-between gap-3 text-[13.5px]">
        <span>
          {index + 1}. {question.text}
        </span>
        <span className="shrink-0 font-bold tabular-nums">{question.average.toFixed(1)}</span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        {question.counts.map((n, i) =>
          n ? (
            <span
              key={LIKERT_LABELS[i]}
              className={SHADES[i]}
              style={{ width: `${(n / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <p className="sr-only">
        {question.counts.map((n, i) => `${LIKERT_LABELS[i]}: ${n}`).join(', ')}
      </p>
    </li>
  );
}

/** One course's results: answer rate, averages per question and anonymous comments. */
export default function EvaluationReportPage() {
  const { offeringId = '' } = useParams();
  const query = useQuery({
    queryKey: keys.evaluationReport(offeringId),
    queryFn: () => api.evaluation.report(offeringId),
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
  });
  const report = query.data;
  const back = (
    <Link
      to="/academics/evaluation"
      className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-link hover:underline"
    >
      <ArrowLeft className="size-3.5" aria-hidden /> Teacher evaluation
    </Link>
  );
  if (query.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (!report) {
    return (
      <>
        {back}
        <EmptyState icon={Star} title="Can't open these results">
          {query.error instanceof ApiError ? query.error.message : 'Try again in a moment.'}
        </EmptyState>
      </>
    );
  }
  const rate = report.enrolled ? Math.round((report.responses / report.enrolled) * 100) : 0;
  return (
    <>
      {back}
      <PageHeader
        title={`${report.code} ${report.title}`}
        description={`${report.teacher?.name ?? 'Teacher'} · ${report.sectionName} · ${report.term.name}`}
      />
      <StatStrip className="mb-5 sm:grid-cols-3 xl:grid-cols-3">
        <Stat
          label="Answers"
          value={`${report.responses} / ${report.enrolled}`}
          hint={`${rate}% of the class`}
        />
        <Stat
          label="Overall"
          value={report.summary ? `${report.summary.overall.toFixed(1)} / 5` : '—'}
          hint="Average of every question"
        />
        <Stat
          label="Comments"
          value={
            report.summary ? report.summary.wentWell.length + report.summary.improve.length : '—'
          }
        />
      </StatStrip>
      {report.hiddenReason || !report.summary ? (
        <EmptyState
          icon={EyeOff}
          title="Results are hidden for now"
          className="rounded-lg border bg-surface"
        >
          {report.hiddenReason}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card
            title="Ratings"
            description="1 = strongly disagree, 5 = strongly agree. Bars run from red (disagree) to green (agree)."
            className="lg:col-span-2"
          >
            <ol className="divide-y">
              {report.summary.questions.map((q, i) => (
                <QuestionRow key={q.id} index={i} question={q} />
              ))}
            </ol>
          </Card>
          <Card title="What went well">
            <CommentList comments={report.summary.wentWell} />
          </Card>
          <Card title="What could be better">
            <CommentList comments={report.summary.improve} />
          </Card>
        </div>
      )}
    </>
  );
}

function CommentList({ comments }: { comments: string[] }) {
  if (!comments.length) {
    return <p className="px-4 py-4 text-[13px] text-muted-foreground">No comments.</p>;
  }
  return (
    <ul className="divide-y">
      {comments.map((c, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: identical comments can repeat
        <li key={i} className="px-4 py-2.5 text-[13.5px]">
          “{c}”
        </li>
      ))}
    </ul>
  );
}
