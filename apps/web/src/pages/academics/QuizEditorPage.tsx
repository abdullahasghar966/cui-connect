import { QUIZ_LIMITS, type QuizViewDTO, quizSchema } from '@cui/shared';
import { Plus, Trash2, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { useSubmit } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';

interface DraftQuestion {
  key: string;
  id?: string;
  text: string;
  options: string[];
  correct: number;
  points: number;
  seconds: number;
}

const LETTERS = 'ABCDEF';
const SECONDS = [10, 15, 20, 30, 45, 60, 90, 120];
let nextKey = 0;
const blank = (): DraftQuestion => ({
  key: `new-${nextKey++}`,
  text: '',
  options: ['', ''],
  correct: 0,
  points: 1,
  seconds: 30,
});

/** Writing a quiz: questions with 2–6 options, the right one marked, points and time each. */
export function QuizEditor({
  offeringId,
  quiz,
  onSaved,
  onDirty,
}: {
  offeringId: string;
  quiz?: QuizViewDTO;
  onSaved: (saved: QuizViewDTO) => void;
  onDirty?: (dirty: boolean) => void;
}) {
  const [title, setTitle] = useState(quiz?.title ?? '');
  const [questions, setQuestions] = useState<DraftQuestion[]>(
    quiz?.questions?.map((q) => ({ ...q, key: q.id, correct: q.correct ?? 0 })) ?? [blank()],
  );
  const save = useSubmit(
    quizSchema,
    (input) => api.teaching.saveQuiz(input, quiz ? { id: quiz.id } : { offeringId }),
    { done: 'Quiz saved', invalidate: [keys.coursework] },
  );
  const touch = () => onDirty?.(true);
  const update = (key: string, change: Partial<DraftQuestion>) => {
    touch();
    setQuestions((list) => list.map((q) => (q.key === key ? { ...q, ...change } : q)));
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.run(
      {
        title,
        questions: questions.map(({ key: _key, ...q }) => ({ ...q, text: q.text.trim() })),
      },
      (saved) => {
        onDirty?.(false);
        onSaved(saved);
      },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Quiz title" htmlFor="quiz-title">
        <Input
          id="quiz-title"
          value={title}
          onChange={(e) => {
            touch();
            setTitle(e.target.value);
          }}
          placeholder="e.g. Quick check: Socket.IO rooms"
          className="max-w-xl"
        />
      </Field>
      <ol className="space-y-4">
        {questions.map((q, index) => (
          <li key={q.key} className="rounded-lg border bg-surface">
            <div className="flex items-center gap-2 border-b px-4 py-2.5">
              <h2 className="flex-1 text-[14px] font-bold">Question {index + 1}</h2>
              <span className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                Points
                <Input
                  type="number"
                  min={1}
                  max={QUIZ_LIMITS.maxPoints}
                  value={q.points}
                  onChange={(e) => update(q.key, { points: Number(e.target.value) })}
                  className="h-7 w-16"
                  aria-label={`Points for question ${index + 1}`}
                />
              </span>
              <span className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                Time
                <Select
                  value={q.seconds}
                  onChange={(e) => update(q.key, { seconds: Number(e.target.value) })}
                  className="h-7 w-24"
                  aria-label={`Time for question ${index + 1}`}
                >
                  {SECONDS.map((s) => (
                    <option key={s} value={s}>
                      {s} s
                    </option>
                  ))}
                </Select>
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove question ${index + 1}`}
                disabled={questions.length === 1}
                onClick={() => {
                  touch();
                  setQuestions((list) => list.filter((x) => x.key !== q.key));
                }}
              >
                <Trash2 />
              </Button>
            </div>
            <div className="space-y-3 p-4">
              <Textarea
                rows={2}
                value={q.text}
                onChange={(e) => update(q.key, { text: e.target.value })}
                placeholder="Write the question"
                aria-label={`Question ${index + 1}`}
              />
              <fieldset className="space-y-2">
                <legend className="mb-1 text-[12.5px] text-muted-foreground">
                  Options: mark the right one
                </legend>
                {q.options.map((option, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: options are edited in place by position.
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`correct-${q.key}`}
                      checked={q.correct === i}
                      onChange={() => update(q.key, { correct: i })}
                      className="size-4 accent-primary"
                      aria-label={`Option ${LETTERS[i]} is right`}
                    />
                    <span className="w-4 text-[13px] font-bold text-muted-foreground">
                      {LETTERS[i]}
                    </span>
                    <Input
                      value={option}
                      onChange={(e) =>
                        update(q.key, {
                          options: q.options.map((o, j) => (j === i ? e.target.value : o)),
                        })
                      }
                      aria-label={`Question ${index + 1} option ${LETTERS[i]}`}
                      placeholder={`Option ${LETTERS[i]}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove option ${LETTERS[i]}`}
                      disabled={q.options.length <= QUIZ_LIMITS.minOptions}
                      onClick={() =>
                        update(q.key, {
                          options: q.options.filter((_, j) => j !== i),
                          correct: q.correct === i ? 0 : q.correct > i ? q.correct - 1 : q.correct,
                        })
                      }
                    >
                      <X />
                    </Button>
                  </div>
                ))}
              </fieldset>
              {q.options.length < QUIZ_LIMITS.maxOptions && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => update(q.key, { options: [...q.options, ''] })}
                >
                  <Plus /> Add option
                </Button>
              )}
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          disabled={questions.length >= QUIZ_LIMITS.questions}
          onClick={() => {
            touch();
            setQuestions((list) => [...list, blank()]);
          }}
        >
          <Plus /> Add question
        </Button>
        <span className="flex-1" />
        <Button type="submit" loading={save.pending}>
          Save quiz
        </Button>
      </div>
    </form>
  );
}

/** A new quiz for one course (`?course=<offeringId>`). */
export default function QuizEditorPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const offeringId = params.get('course') ?? '';
  return (
    <>
      <PageHeader
        title="New live quiz"
        description="Write the questions now; run it in class later. Students answer on their phones, you see the answers come in, and the scores can go into the marks sheet."
      />
      <QuizEditor
        offeringId={offeringId}
        onSaved={(quiz) => navigate(`/academics/quizzes/${quiz.id}`, { replace: true })}
      />
    </>
  );
}
