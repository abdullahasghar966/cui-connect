import type { QuizPresenceEvent, QuizRankDTO, QuizTallyEvent, QuizViewDTO } from '@cui/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CircleCheck,
  CircleX,
  Clock,
  NotebookPen,
  Play,
  SkipForward,
  Square,
  Trash2,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, Spinner } from '@/components/feedback';
import { Card, PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { errorMessage, useAction } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { ACK_TIMEOUT_MS, getSocket, withAck } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { QuizBadge } from './coursework-ui';
import { QuizEditor } from './QuizEditorPage';

const LETTERS = 'ABCDEF';

/**
 * Keeps this page in the quiz's socket room (rejoining after a reconnect). The teacher's screen
 * also gets the live tally and how many students have the quiz open.
 */
function useQuizRoom(quizId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const socket = getSocket();
    const key = keys.quiz(quizId);
    const join = () => {
      void withAck(socket.timeout(ACK_TIMEOUT_MS).emitWithAck('quiz:join', { quizId }));
    };
    const onTally = (t: QuizTallyEvent) => {
      if (t.quizId !== quizId) return;
      qc.setQueryData<QuizViewDTO>(key, (v) =>
        v?.question?.id === t.questionId
          ? { ...v, answered: t.answered, question: { ...v.question, counts: t.counts } }
          : v,
      );
    };
    const onPresence = (p: QuizPresenceEvent) => {
      if (p.quizId !== quizId) return;
      qc.setQueryData<QuizViewDTO>(key, (v) => (v ? { ...v, joined: p.joined } : v));
    };
    if (socket.connected) join();
    socket.on('connect', join);
    socket.on('quiz:tally', onTally);
    socket.on('quiz:presence', onPresence);
    return () => {
      socket.emit('quiz:leave', { quizId });
      socket.off('connect', join);
      socket.off('quiz:tally', onTally);
      socket.off('quiz:presence', onPresence);
    };
  }, [qc, quizId]);
}

/** Seconds left on the open question, counting down from when the view was fetched. */
function useSecondsLeft(view: QuizViewDTO, fetchedAt: number): number {
  const [now, setNow] = useState(() => Date.now());
  const remaining = view.question?.remainingMs ?? 0;
  useEffect(() => {
    if (!remaining) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [remaining]);
  // A clock reading from before this fetch (it hasn't ticked yet) counts as no time passed.
  const elapsed = Math.max(0, now - fetchedAt);
  return Math.max(0, Math.ceil((remaining - elapsed) / 1000));
}

function Countdown({ seconds, total }: { seconds: number; total: number }) {
  return (
    <span
      role="timer"
      aria-label={`${seconds} seconds left`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[15px] font-bold tabular-nums',
        seconds <= Math.min(5, total / 3) ? 'border-danger/40 text-danger' : 'text-foreground',
      )}
    >
      <Clock className="size-4" aria-hidden /> {seconds}s
    </span>
  );
}

function Leaderboard({
  ranks,
  total,
  title = 'Top scores',
}: {
  ranks: QuizRankDTO[];
  total: number;
  title?: string;
}) {
  if (!ranks.length) return null;
  return (
    <Card title={title}>
      <ol className="divide-y">
        {ranks.map((r) => (
          <li key={r.studentId} className="flex items-center gap-3 px-4 py-2 text-[14px]">
            <span
              className={cn(
                'flex size-7 items-center justify-center rounded-full text-[13px] font-bold',
                r.rank === 1
                  ? 'bg-warning-soft text-warning'
                  : 'bg-surface-2 text-muted-foreground',
              )}
            >
              {r.rank}
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
            <span className="font-bold tabular-nums">
              {r.score}
              <span className="font-normal text-muted-foreground">/{total}</span>
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** Option bars: the share of answers, the right one highlighted once shown. */
function OptionBars({ view }: { view: QuizViewDTO }) {
  const q = view.question;
  if (!q) return null;
  const counts = q.counts ?? q.options.map(() => 0);
  const most = Math.max(1, ...counts);
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {q.options.map((option, i) => {
        const right = q.correct === i && (q.revealed || view.isHost);
        return (
          <li
            key={option}
            className={cn(
              'relative overflow-hidden rounded-lg border bg-surface px-4 py-3',
              q.revealed && right && 'border-primary ring-2 ring-primary/30',
              q.revealed && !right && 'opacity-70',
            )}
          >
            <span
              className={cn(
                'absolute inset-y-0 left-0 transition-[width] duration-500',
                right && q.revealed ? 'bg-primary-soft' : 'bg-surface-2',
              )}
              style={{ width: `${((counts[i] ?? 0) / most) * 100}%` }}
              aria-hidden
            />
            <span className="relative flex items-center gap-3 text-[15px]">
              <b className="text-muted-foreground">{LETTERS[i]}</b>
              <span className="min-w-0 flex-1 font-semibold">{option}</span>
              {right && <CircleCheck className="size-5 text-primary" aria-label="Right answer" />}
              <span className="font-bold tabular-nums">{counts[i] ?? 0}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function HostScreen({ view, fetchedAt }: { view: QuizViewDTO; fetchedAt: number }) {
  const qc = useQueryClient();
  const seconds = useSecondsLeft(view, fetchedAt);
  const [busy, setBusy] = useState(false);
  const step = async (name: 'next' | 'reveal' | 'end') => {
    setBusy(true);
    try {
      qc.setQueryData(keys.quiz(view.id), await api.teaching.quizStep(view.id, name));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const q = view.question;
  const last = view.current >= view.questionCount - 1;

  if (!q) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-4 px-4 py-14 text-center">
          <p className="flex items-center gap-2 text-[15px] text-muted-foreground">
            <Users className="size-5" aria-hidden />
            <span>
              <b className="text-[28px] text-foreground tabular-nums">{view.joined}</b> student
              {view.joined === 1 ? '' : 's'} joined
            </span>
          </p>
          <p className="max-w-md text-[14px] text-muted-foreground">
            Students were told the quiz has started. They can also open it from Coursework. Show the
            first question when the class is ready.
          </p>
          <Button size="lg" loading={busy} onClick={() => void step('next')}>
            <Play /> Show the first question
          </Button>
        </div>
      </Card>
    );
  }
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="outline">
              Question {q.index + 1} of {view.questionCount}
            </Badge>
            <span className="text-[13px] text-muted-foreground">
              {q.points} point{q.points === 1 ? '' : 's'}
            </span>
            <span className="flex-1" />
            {q.revealed ? (
              <Badge tone="primary">Answer shown</Badge>
            ) : (
              <Countdown seconds={seconds} total={q.seconds} />
            )}
          </div>
          <h2 className="text-[22px] leading-snug font-bold">{q.text}</h2>
          <OptionBars view={view} />
          <p className="text-[13.5px] text-muted-foreground" aria-live="polite">
            <b className="text-foreground tabular-nums">{view.answered}</b> answered · {view.joined}{' '}
            on the quiz page
          </p>
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {!q.revealed && (
              <Button variant="outline" loading={busy} onClick={() => void step('reveal')}>
                Show the answer
              </Button>
            )}
            {last ? (
              <Button loading={busy} onClick={() => void step('end')}>
                <Square /> Finish and show results
              </Button>
            ) : (
              <Button loading={busy} onClick={() => void step('next')}>
                <SkipForward /> Next question
              </Button>
            )}
            {!last && (
              <Button variant="ghost" loading={busy} onClick={() => void step('end')}>
                End quiz now
              </Button>
            )}
          </div>
        </div>
      </Card>
      <Leaderboard ranks={view.leaderboard.slice(0, 10)} total={view.totalPoints} />
    </div>
  );
}

/** How each question went: the share who got it right shows what to go over again. */
function QuestionBreakdown({ view }: { view: QuizViewDTO }) {
  const stats = new Map((view.breakdown ?? []).map((b) => [b.questionId, b]));
  return (
    <Card title="Questions">
      <ol className="divide-y">
        {(view.questions ?? []).map((q, i) => {
          const s = stats.get(q.id);
          const share = s?.answered ? Math.round((s.correct / s.answered) * 100) : null;
          return (
            <li key={q.id} className="space-y-1.5 px-4 py-3">
              <p className="text-[14px]">
                <b className="text-muted-foreground">{i + 1}.</b> {q.text}
              </p>
              <p className="flex items-center gap-3 text-[13px] text-muted-foreground">
                <span className="h-1.5 w-32 overflow-hidden rounded-full bg-surface-2">
                  <span
                    className={cn(
                      'block h-full rounded-full',
                      share !== null && share < 50 ? 'bg-danger' : 'bg-primary',
                    )}
                    style={{ width: `${share ?? 0}%` }}
                  />
                </span>
                {s?.answered ? `${s.correct} of ${s.answered} right (${share}%)` : 'Not answered'}
                <span>
                  · answer {LETTERS[q.correct ?? 0]}: {q.options[q.correct ?? 0]}
                </span>
              </p>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function HostResults({ view }: { view: QuizViewDTO }) {
  const navigate = useNavigate();
  const saveMarks = useAction(() => api.teaching.saveQuizMarks(view.id), {
    done: 'Saved as quiz marks. Check them and publish them in the marks sheet.',
    invalidate: [keys.coursework, keys.marksSheet(view.course.offeringId)],
  });
  const remove = useAction(() => api.teaching.deleteQuiz(view.id), {
    done: 'Quiz deleted',
    invalidate: [keys.coursework],
  });
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
      <div className="min-w-0 space-y-5">
        {view.leaderboard.length ? (
          <Leaderboard ranks={view.leaderboard} total={view.totalPoints} title="Results" />
        ) : (
          <Card title="Results">
            <p className="p-4 text-[13.5px] text-muted-foreground">Nobody answered.</p>
          </Card>
        )}
        <QuestionBreakdown view={view} />
      </div>
      <Card title="Marks">
        <div className="space-y-3 p-4 text-[13.5px]">
          <p className="text-muted-foreground">
            Save everyone's score as a quiz in the marks sheet. Students who didn't take part get 0,
            which you can change there before publishing.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button loading={saveMarks.isPending} onClick={() => saveMarks.mutate(undefined)}>
              <NotebookPen /> {view.assessmentId ? 'Save scores again' : 'Save as quiz marks'}
            </Button>
            {view.assessmentId && (
              <Link
                to={`/academics/marks/${view.course.offeringId}`}
                className={buttonVariants({ variant: 'outline' })}
              >
                Open the marks sheet
              </Link>
            )}
          </div>
          <Button
            variant="ghost"
            className="text-danger"
            loading={remove.isPending}
            onClick={() =>
              remove.mutate(undefined, {
                onSuccess: () =>
                  navigate(`/academics/coursework/${view.course.offeringId}?tab=quizzes`),
              })
            }
          >
            <Trash2 /> Delete quiz
          </Button>
        </div>
      </Card>
    </div>
  );
}

function StudentScreen({ view, fetchedAt }: { view: QuizViewDTO; fetchedAt: number }) {
  const qc = useQueryClient();
  const seconds = useSecondsLeft(view, fetchedAt);
  const [sending, setSending] = useState<number | null>(null);
  const q = view.question;
  const mine = view.mine;
  const chosen = q && mine ? mine.answers[q.id] : undefined;

  const answer = async (choice: number) => {
    if (!q) return;
    setSending(choice);
    const res = await withAck(
      getSocket()
        .timeout(ACK_TIMEOUT_MS)
        .emitWithAck('quiz:answer', { quizId: view.id, questionId: q.id, choice }),
    );
    setSending(null);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    qc.setQueryData<QuizViewDTO>(keys.quiz(view.id), (v) =>
      v?.mine ? { ...v, mine: { ...v.mine, answers: { ...v.mine.answers, [q.id]: choice } } } : v,
    );
  };

  if (view.status === 'ended') {
    return (
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <Card>
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <Trophy className="size-9 text-warning" aria-hidden />
            <p className="text-[15px] text-muted-foreground">Quiz over. Your score</p>
            <p className="text-[40px] leading-none font-bold tabular-nums">
              {mine?.score ?? 0}
              <span className="text-[20px] text-muted-foreground">/{view.totalPoints}</span>
            </p>
            {mine?.rank && <p className="text-[14px]">You came #{mine.rank} in the class.</p>}
          </div>
        </Card>
        <Leaderboard ranks={view.leaderboard} total={view.totalPoints} />
      </div>
    );
  }
  if (!q) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
          <span className="size-3 animate-pulse rounded-full bg-danger" aria-hidden />
          <p className="text-[17px] font-bold">You're in.</p>
          <p className="text-[14px] text-muted-foreground">
            Waiting for your teacher to show the first question…
          </p>
        </div>
      </Card>
    );
  }

  const answered = chosen !== undefined;
  const timeUp = !q.revealed && seconds === 0;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <div className="space-y-4 p-5">
          <div className="flex items-center gap-3">
            <Badge tone="outline">
              Question {q.index + 1} of {view.questionCount}
            </Badge>
            <span className="text-[13px] text-muted-foreground">
              {q.points} point{q.points === 1 ? '' : 's'}
            </span>
            <span className="flex-1" />
            {!q.revealed && <Countdown seconds={seconds} total={q.seconds} />}
          </div>
          <h2 className="text-[20px] leading-snug font-bold">{q.text}</h2>
          {q.revealed ? (
            <>
              <div
                role="status"
                className={cn(
                  'flex items-center gap-3 rounded-lg border px-4 py-3 text-[15px] font-semibold',
                  chosen === q.correct
                    ? 'border-primary/30 bg-primary-soft text-primary dark:text-link'
                    : 'border-danger/30 bg-danger-soft text-danger',
                )}
              >
                {chosen === q.correct ? (
                  <>
                    <CircleCheck className="size-5" aria-hidden /> Correct! +{q.points}
                  </>
                ) : (
                  <>
                    <CircleX className="size-5" aria-hidden />
                    {answered ? 'Not this time.' : 'No answer.'} The answer was{' '}
                    {LETTERS[q.correct ?? 0]}: {q.options[q.correct ?? 0]}
                  </>
                )}
              </div>
              <OptionBars view={view} />
              <p className="text-[14px]">
                Your score: <b className="tabular-nums">{mine?.score ?? 0}</b>
                {mine?.rank ? ` · #${mine.rank} so far` : ''}
              </p>
            </>
          ) : answered || timeUp ? (
            <p
              role="status"
              className="rounded-lg border bg-surface-2 px-4 py-6 text-center text-[15px]"
            >
              {answered ? (
                <>
                  You answered <b>{LETTERS[chosen]}</b>. Waiting for the others…
                </>
              ) : (
                "Time's up."
              )}
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {q.options.map((option, i) => (
                <Button
                  key={option}
                  variant="outline"
                  size="lg"
                  className="h-auto min-h-14 justify-start gap-3 py-3 text-left whitespace-normal"
                  loading={sending === i}
                  disabled={sending !== null}
                  onClick={() => void answer(i)}
                >
                  <b className="text-muted-foreground">{LETTERS[i]}</b> {option}
                </Button>
              ))}
            </div>
          )}
        </div>
      </Card>
      {q.revealed && <Leaderboard ranks={view.leaderboard} total={view.totalPoints} />}
    </div>
  );
}

function DraftScreen({ view }: { view: QuizViewDTO }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [dirty, setDirty] = useState(false);
  const start = useAction(() => api.teaching.quizStep(view.id, 'start'), {
    done: 'The quiz is live. Students were told.',
    invalidate: [keys.coursework],
  });
  const remove = useAction(() => api.teaching.deleteQuiz(view.id), {
    done: 'Quiz deleted',
    invalidate: [keys.coursework],
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-surface px-4 py-3">
        <p className="min-w-0 flex-1 text-[13.5px] text-muted-foreground">
          {dirty
            ? 'Save your changes before starting.'
            : 'Ready when you are: starting tells the class, then you show one question at a time.'}
        </p>
        <Button
          variant="ghost"
          className="text-danger"
          loading={remove.isPending}
          onClick={() =>
            remove.mutate(undefined, {
              onSuccess: () =>
                navigate(`/academics/coursework/${view.course.offeringId}?tab=quizzes`),
            })
          }
        >
          <Trash2 /> Delete
        </Button>
        <Button
          disabled={dirty}
          loading={start.isPending}
          onClick={() =>
            start.mutate(undefined, {
              onSuccess: (live) => qc.setQueryData(keys.quiz(view.id), live),
            })
          }
        >
          <Zap /> Start live quiz
        </Button>
      </div>
      <QuizEditor
        offeringId={view.course.offeringId}
        quiz={view}
        onDirty={setDirty}
        onSaved={(saved) => qc.setQueryData(keys.quiz(view.id), saved)}
      />
    </div>
  );
}

export default function QuizPage() {
  const { quizId = '' } = useParams();
  const query = useQuery({
    queryKey: keys.quiz(quizId),
    queryFn: () => api.coursework.quiz(quizId),
  });
  useQuizRoom(quizId);
  const view = query.data;

  if (query.isError) {
    return <EmptyState icon={Zap} title="This quiz isn't available to you" />;
  }
  if (!view) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  return (
    <>
      <PageHeader
        title={view.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Link
              to={`/academics/coursework/${view.course.offeringId}?tab=quizzes`}
              className="hover:underline"
            >
              {view.course.code} {view.course.title}
              {view.course.sectionName ? ` · ${view.course.sectionName}` : ''}
            </Link>
            <QuizBadge status={view.status} />
            <span>
              {view.questionCount} question{view.questionCount === 1 ? '' : 's'} ·{' '}
              {view.totalPoints} points
            </span>
          </span>
        }
      />
      {view.isHost ? (
        view.status === 'draft' ? (
          <DraftScreen view={view} />
        ) : view.status === 'live' ? (
          <HostScreen view={view} fetchedAt={query.dataUpdatedAt} />
        ) : (
          <HostResults view={view} />
        )
      ) : (
        <StudentScreen view={view} fetchedAt={query.dataUpdatedAt} />
      )}
    </>
  );
}
