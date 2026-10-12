/**
 * Live quizzes, run in class. The teacher starts the quiz and shows one question at a time;
 * students answer on their phones over Socket.IO (`quiz:answer`, acknowledged). The teacher's
 * screen gets a live tally (`quiz:tally`, host only). A question closes when its time is up or
 * everyone has answered, then the right answer and the top five are shown to all (`quiz:state`
 * makes every open quiz page refetch its own view). At the end the scores can be saved as a
 * quiz column in the marks sheet.
 */
import {
  campusClock,
  canStudyIn,
  QUIZ_ANSWER_GRACE_MS,
  type QuizAnswerInput,
  type QuizInput,
  type QuizQuestionDTO,
  type QuizRankDTO,
  type QuizSummaryDTO,
  type QuizViewDTO,
  quizSchema,
  rankQuiz,
} from '@cui/shared';
import type { Types } from 'mongoose';
import {
  assertAllowed,
  badRequest,
  conflict,
  isDuplicateKeyError,
  notFound,
  parse,
} from '../lib/errors';
import { logger } from '../lib/logger';
import {
  Assessment,
  type CourseOfferingDoc,
  Group,
  Quiz,
  type QuizDoc,
  type QuizQuestion,
  QuizResponse,
  type QuizResponseDoc,
  User,
  type UserDoc,
} from '../models';
import { broadcastQuizState, quizJoinedCount, sendQuizTally } from '../realtime/notifier';
import { recordAudit } from './audit';
import { getOrgLookup, sameId, toObjectId, toPolicyUser } from './mappers';
import { saveMarks, updateAssessment } from './marks';
import { notify } from './notifications';
import {
  contextFor,
  courseLabel,
  courseRef,
  loadOffering,
  manageDecision,
  type OfferingContext,
} from './offering-context';
import { offeringFacts } from './timetable';

/** Closes each open question when its time is up (one timer per running quiz). */
const timers = new Map<string, NodeJS.Timeout>();

export function stopQuizTimers(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
}

async function loadQuiz(quizId: string) {
  const quiz = await Quiz.findById(toObjectId(quizId)).lean<QuizDoc>();
  if (!quiz) throw notFound('Quiz not found.');
  const ctx = await loadOffering(String(quiz.offeringId));
  return { quiz, ctx };
}

function roleIn(user: UserDoc, ctx: OfferingContext) {
  return {
    host: manageDecision(user, ctx).allowed,
    student: canStudyIn(toPolicyUser(user), offeringFacts(ctx.offering, ctx.section)).allowed,
  };
}

/** The course's teacher sees every quiz; its students see one once it has started. */
export function assertCanSeeQuiz(
  user: UserDoc,
  quiz: Pick<QuizDoc, 'status'>,
  ctx: OfferingContext,
): { host: boolean } {
  const { host, student } = roleIn(user, ctx);
  if (host) return { host: true };
  if (student && quiz.status !== 'draft') return { host: false };
  if (student) throw notFound('Quiz not found.');
  assertAllowed(canStudyIn(toPolicyUser(user), offeringFacts(ctx.offering, ctx.section)));
  return { host: false };
}

/** Keeps the ids of questions that were already there; new ones get the next free number. */
function withIds(
  questions: ReturnType<typeof parse<typeof quizSchema>>['questions'],
  previous: QuizQuestion[],
): QuizQuestion[] {
  const known = new Set(previous.map((q) => q.id));
  let next = Math.max(0, ...previous.map((q) => Number(q.id.slice(1)))) + 1;
  const seen = new Set<string>();
  return questions.map((q) => {
    const id = q.id && known.has(q.id) && !seen.has(q.id) ? q.id : `q${next++}`;
    seen.add(id);
    return {
      id,
      text: q.text,
      options: q.options,
      correct: q.correct,
      points: q.points,
      seconds: q.seconds,
    };
  });
}

const totalPoints = (quiz: Pick<QuizDoc, 'questions'>) =>
  quiz.questions.reduce((sum, q) => sum + q.points, 0);

async function courseGroupId(offeringId: Types.ObjectId): Promise<string | null> {
  const group = await Group.findOne({ type: 'COURSE', courseId: offeringId }).select('_id').lean();
  return group ? String(group._id) : null;
}

/** Everyone on the quiz page and in the course chat refreshes their view. */
async function announce(
  quiz: Pick<QuizDoc, '_id' | 'offeringId' | 'status' | 'current' | 'revealed'>,
) {
  broadcastQuizState(await courseGroupId(quiz.offeringId), {
    quizId: String(quiz._id),
    status: quiz.status,
    current: quiz.current,
    revealed: quiz.revealed,
  });
}

// ---- Scores ----

async function rankings(responses: QuizResponseDoc[]): Promise<QuizRankDTO[]> {
  const totals = new Map<string, { score: number; ms: number }>();
  for (const r of responses) {
    const id = String(r.studentId);
    const t = totals.get(id) ?? { score: 0, ms: 0 };
    totals.set(id, { score: t.score + r.points, ms: t.ms + r.ms });
  }
  const names = new Map(
    (
      await User.find({ _id: { $in: [...totals.keys()].map((id) => toObjectId(id)) } })
        .select('name')
        .lean()
    ).map((u) => [String(u._id), u.name]),
  );
  return rankQuiz([...totals].map(([studentId, t]) => ({ studentId, ...t }))).map((r) => ({
    rank: r.rank,
    studentId: r.studentId,
    name: names.get(r.studentId) ?? 'Student',
    score: r.score,
  }));
}

const countsFor = (q: QuizQuestion, responses: QuizResponseDoc[]) =>
  q.options.map((_, i) => responses.filter((r) => r.questionId === q.id && r.choice === i).length);

const toQuestionDTO = (q: QuizQuestion, showAnswer: boolean): QuizQuestionDTO => ({
  id: q.id,
  text: q.text,
  options: q.options,
  correct: showAnswer ? q.correct : null,
  points: q.points,
  seconds: q.seconds,
});

/** The quiz as this viewer sees it right now. */
export async function quizView(viewer: UserDoc, quizId: string): Promise<QuizViewDTO> {
  const { quiz, ctx } = await loadQuiz(quizId);
  const { host } = assertCanSeeQuiz(viewer, quiz, ctx);
  const responses = await QuizResponse.find({ quizId: quiz._id }).lean<QuizResponseDoc[]>();
  const ended = quiz.status === 'ended';
  const q = quiz.current >= 0 ? quiz.questions[quiz.current] : undefined;
  const revealed = quiz.revealed || ended;
  const startedAt = quiz.questionStartedAt?.getTime() ?? 0;
  const ranked = await rankings(responses);
  const me = String(viewer._id);
  const own = responses.filter((r) => sameId(r.studentId, viewer._id));

  return {
    id: String(quiz._id),
    course: courseRef(ctx),
    title: quiz.title,
    status: quiz.status,
    isHost: host,
    questionCount: quiz.questions.length,
    totalPoints: totalPoints(quiz),
    questions: host ? quiz.questions.map((x) => toQuestionDTO(x, true)) : null,
    current: quiz.current,
    question:
      q && quiz.status !== 'draft'
        ? {
            ...toQuestionDTO(q, host || revealed),
            index: quiz.current,
            revealed,
            remainingMs: revealed ? 0 : Math.max(0, startedAt + q.seconds * 1000 - Date.now()),
            counts: host || revealed ? countsFor(q, responses) : null,
          }
        : null,
    answered: q ? responses.filter((r) => r.questionId === q.id).length : 0,
    joined: host ? await quizJoinedCount(String(quiz._id)) : 0,
    leaderboard: host ? ranked : revealed && q ? ranked.slice(0, 5) : [],
    mine: host
      ? null
      : {
          answers: Object.fromEntries(own.map((r) => [r.questionId, r.choice])),
          score: own.reduce((sum, r) => sum + r.points, 0),
          rank: ranked.find((r) => r.studentId === me)?.rank ?? null,
        },
    assessmentId: host && quiz.assessmentId ? String(quiz.assessmentId) : null,
    breakdown: host
      ? quiz.questions.map((x) => {
          const answers = responses.filter((r) => r.questionId === x.id);
          return {
            questionId: x.id,
            answered: answers.length,
            correct: answers.filter((r) => r.correct).length,
          };
        })
      : null,
  };
}

/** Quizzes of these courses for lists: students see started ones with their own score. */
export async function quizSummaries(
  viewer: UserDoc,
  offerings: CourseOfferingDoc[],
  asStudent: boolean,
): Promise<QuizSummaryDTO[]> {
  if (!offerings.length) return [];
  const ids = offerings.map((o) => o._id);
  const [quizzes, org] = await Promise.all([
    Quiz.find({ offeringId: { $in: ids }, ...(asStudent ? { status: { $ne: 'draft' } } : {}) })
      .sort({ createdAt: -1 })
      .lean<QuizDoc[]>(),
    getOrgLookup(),
  ]);
  const responses = await QuizResponse.find({ quizId: { $in: quizzes.map((q) => q._id) } })
    .select('quizId studentId points')
    .lean<Pick<QuizResponseDoc, 'quizId' | 'studentId' | 'points'>[]>();
  const byOffering = new Map(offerings.map((o) => [String(o._id), o]));
  return quizzes.flatMap((quiz) => {
    const offering = byOffering.get(String(quiz.offeringId));
    if (!offering) return [];
    const own = responses.filter((r) => sameId(r.quizId, quiz._id));
    const mine = own.filter((r) => sameId(r.studentId, viewer._id));
    return [
      {
        id: String(quiz._id),
        course: courseRef(contextFor(offering, org)),
        title: quiz.title,
        status: quiz.status,
        questionCount: quiz.questions.length,
        totalPoints: totalPoints(quiz),
        startedAt: quiz.startedAt?.toISOString() ?? null,
        endedAt: quiz.endedAt?.toISOString() ?? null,
        myScore:
          asStudent && quiz.status === 'ended' ? mine.reduce((sum, r) => sum + r.points, 0) : null,
        participants: asStudent ? null : new Set(own.map((r) => String(r.studentId))).size,
        savedToMarks: !!quiz.assessmentId,
      },
    ];
  });
}

// ---- The teacher: writing ----

export async function createQuiz(
  actor: UserDoc,
  offeringId: string,
  input: QuizInput,
): Promise<QuizViewDTO> {
  const ctx = await loadOffering(offeringId);
  assertAllowed(manageDecision(actor, ctx));
  const data = parse(quizSchema, input);
  const quiz = await Quiz.create({
    offeringId: ctx.offering._id,
    title: data.title,
    questions: withIds(data.questions, []),
    createdById: actor._id,
  });
  return quizView(actor, String(quiz._id));
}

export async function updateQuiz(
  actor: UserDoc,
  quizId: string,
  input: QuizInput,
): Promise<QuizViewDTO> {
  const { quiz, ctx } = await loadQuiz(quizId);
  assertAllowed(manageDecision(actor, ctx));
  if (quiz.status !== 'draft') throw badRequest('A quiz can only be edited before it starts.');
  const data = parse(quizSchema, input);
  await Quiz.updateOne(
    { _id: quiz._id, status: 'draft' },
    { $set: { title: data.title, questions: withIds(data.questions, quiz.questions) } },
  );
  return quizView(actor, quizId);
}

export async function deleteQuiz(actor: UserDoc, quizId: string): Promise<void> {
  const { quiz, ctx } = await loadQuiz(quizId);
  assertAllowed(manageDecision(actor, ctx));
  if (quiz.status === 'live') throw badRequest('End the quiz before deleting it.');
  await Promise.all([
    Quiz.deleteOne({ _id: quiz._id }),
    QuizResponse.deleteMany({ quizId: quiz._id }),
  ]);
}

// ---- The teacher: running it ----

export async function startQuiz(actor: UserDoc, quizId: string): Promise<QuizViewDTO> {
  const { quiz, ctx } = await loadQuiz(quizId);
  assertAllowed(manageDecision(actor, ctx));
  const started = await Quiz.findOneAndUpdate(
    { _id: quiz._id, status: 'draft' },
    {
      $set: {
        status: 'live',
        current: -1,
        revealed: false,
        questionStartedAt: null,
        startedAt: new Date(),
      },
    },
    { returnDocument: 'after' },
  ).lean<QuizDoc>();
  if (!started) throw badRequest('This quiz has already been run.');
  void recordAudit({
    action: 'quiz.started',
    actor,
    summary: `${actor.name} started the live quiz "${quiz.title}" in ${courseLabel(ctx)}`,
    targetType: 'course',
    targetId: ctx.offering._id,
  });
  await notify(ctx.offering.studentIds, {
    type: 'coursework',
    title: `Live quiz in ${ctx.offering.title}: ${quiz.title}`,
    body: 'It is starting now. Open it to answer.',
    link: `/academics/quizzes/${quiz._id}`,
    key: `quiz:${quiz._id}:live`,
  });
  await announce(started);
  return quizView(actor, quizId);
}

function scheduleClose(quiz: QuizDoc, index: number) {
  const id = String(quiz._id);
  clearTimeout(timers.get(id));
  const question = quiz.questions[index];
  if (!question) return;
  const timer = setTimeout(
    () => {
      timers.delete(id);
      closeQuestion(id, index).catch((err) =>
        logger.error({ err }, 'Closing a quiz question failed'),
      );
    },
    question.seconds * 1000 + QUIZ_ANSWER_GRACE_MS,
  );
  timer.unref();
  timers.set(id, timer);
}

/** Shows the next question (closing the current one if the teacher skips ahead). */
export async function nextQuestion(actor: UserDoc, quizId: string): Promise<QuizViewDTO> {
  const { quiz, ctx } = await loadQuiz(quizId);
  assertAllowed(manageDecision(actor, ctx));
  if (quiz.status !== 'live') throw badRequest('Start the quiz first.');
  const index = quiz.current + 1;
  if (index >= quiz.questions.length) {
    throw badRequest('That was the last question. End the quiz to show the results.');
  }
  // Conditional on the current index, so a double click can't skip a question.
  const moved = await Quiz.findOneAndUpdate(
    { _id: quiz._id, status: 'live', current: quiz.current },
    { $set: { current: index, revealed: false, questionStartedAt: new Date() } },
    { returnDocument: 'after' },
  ).lean<QuizDoc>();
  if (moved) {
    scheduleClose(moved, index);
    await announce(moved);
  }
  return quizView(actor, quizId);
}

/** Closes question `index` and shows the answer (no-op if it already moved on or closed). */
async function closeQuestion(quizId: string, index: number): Promise<void> {
  const closed = await Quiz.findOneAndUpdate(
    { _id: toObjectId(quizId), status: 'live', current: index, revealed: false },
    { $set: { revealed: true } },
    { returnDocument: 'after' },
  ).lean<QuizDoc>();
  if (!closed) return;
  clearTimeout(timers.get(quizId));
  timers.delete(quizId);
  await announce(closed);
}

export async function revealAnswer(actor: UserDoc, quizId: string): Promise<QuizViewDTO> {
  const { quiz, ctx } = await loadQuiz(quizId);
  assertAllowed(manageDecision(actor, ctx));
  if (quiz.status !== 'live' || quiz.current < 0) throw badRequest('No question is open.');
  await closeQuestion(quizId, quiz.current);
  return quizView(actor, quizId);
}

export async function endQuiz(actor: UserDoc, quizId: string): Promise<QuizViewDTO> {
  const { quiz, ctx } = await loadQuiz(quizId);
  assertAllowed(manageDecision(actor, ctx));
  const ended = await Quiz.findOneAndUpdate(
    { _id: quiz._id, status: 'live' },
    { $set: { status: 'ended', revealed: true, endedAt: new Date() } },
    { returnDocument: 'after' },
  ).lean<QuizDoc>();
  if (!ended) throw badRequest('The quiz is not running.');
  clearTimeout(timers.get(quizId));
  timers.delete(quizId);
  await announce(ended);
  return quizView(actor, quizId);
}

/** Saves (or updates) everyone's score as a quiz column in the marks sheet, unpublished. */
export async function saveQuizMarks(
  actor: UserDoc,
  quizId: string,
): Promise<{ assessmentId: string; saved: number }> {
  const { quiz, ctx } = await loadQuiz(quizId);
  assertAllowed(manageDecision(actor, ctx));
  if (quiz.status !== 'ended') throw badRequest('End the quiz before saving its marks.');
  const total = totalPoints(quiz);
  const date = campusClock(quiz.startedAt ?? new Date()).date;
  const existing =
    quiz.assessmentId && (await Assessment.exists({ _id: quiz.assessmentId }))
      ? quiz.assessmentId
      : null;
  let assessmentId: Types.ObjectId;
  if (existing) {
    await updateAssessment(actor, String(existing), {
      type: 'quiz',
      title: quiz.title,
      total,
      date,
    });
    assessmentId = existing;
  } else {
    const created = await Assessment.create({
      offeringId: ctx.offering._id,
      type: 'quiz',
      title: quiz.title,
      total,
      date,
      createdById: actor._id,
    });
    assessmentId = created._id;
    await Quiz.updateOne({ _id: quiz._id }, { $set: { assessmentId } });
  }
  const scores = new Map<string, number>();
  for (const r of await QuizResponse.find({ quizId: quiz._id }).lean<QuizResponseDoc[]>()) {
    scores.set(String(r.studentId), (scores.get(String(r.studentId)) ?? 0) + r.points);
  }
  const marks = ctx.offering.studentIds.map((id) => ({
    studentId: String(id),
    // Absent from the quiz: 0 (the teacher can change it in the marks sheet).
    obtained: scores.get(String(id)) ?? 0,
  }));
  const { saved } = marks.length
    ? await saveMarks(actor, String(assessmentId), { marks })
    : { saved: 0 };
  void recordAudit({
    action: 'quiz.marks-saved',
    actor,
    summary: `${actor.name} saved the scores of "${quiz.title}" as quiz marks in ${courseLabel(ctx)}`,
    targetType: 'course',
    targetId: ctx.offering._id,
  });
  return { assessmentId: String(assessmentId), saved };
}

// ---- Students ----

/** Who may open the live quiz page (and join its socket room). */
export async function quizAccess(user: UserDoc, quizId: string): Promise<{ host: boolean }> {
  const { quiz, ctx } = await loadQuiz(quizId);
  return assertCanSeeQuiz(user, quiz, ctx);
}

export async function answerQuiz(
  student: UserDoc,
  input: QuizAnswerInput,
): Promise<{ questionId: string; choice: number }> {
  const { quiz, ctx } = await loadQuiz(input.quizId);
  assertAllowed(canStudyIn(toPolicyUser(student), offeringFacts(ctx.offering, ctx.section)));
  if (quiz.status !== 'live') throw badRequest('The quiz is not running.');
  const question = quiz.questions[quiz.current];
  if (!question || question.id !== input.questionId) {
    throw badRequest('That question is closed.');
  }
  const elapsed = Date.now() - (quiz.questionStartedAt?.getTime() ?? 0);
  if (quiz.revealed || elapsed > question.seconds * 1000 + QUIZ_ANSWER_GRACE_MS) {
    throw badRequest('Time is up for this question.');
  }
  if (input.choice >= question.options.length) throw badRequest('Choose one of the options.');
  const correct = input.choice === question.correct;
  try {
    await QuizResponse.create({
      quizId: quiz._id,
      questionId: question.id,
      studentId: student._id,
      choice: input.choice,
      correct,
      points: correct ? question.points : 0,
      ms: Math.max(0, elapsed),
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) throw conflict('You already answered this question.');
    throw err;
  }

  const answers = await QuizResponse.find({ quizId: quiz._id, questionId: question.id })
    .select('choice')
    .lean<Pick<QuizResponseDoc, 'choice'>[]>();
  sendQuizTally(String(quiz._id), {
    quizId: String(quiz._id),
    questionId: question.id,
    counts: question.options.map((_, i) => answers.filter((a) => a.choice === i).length),
    answered: answers.length,
  });
  // Everyone has answered: no need to wait for the clock.
  if (answers.length >= ctx.offering.studentIds.length) {
    await closeQuestion(String(quiz._id), quiz.current);
  }
  return { questionId: question.id, choice: input.choice };
}
