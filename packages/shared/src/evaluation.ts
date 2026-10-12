/**
 * Anonymous teacher evaluation: the questionnaire, and how answers become a report. Answers are
 * stored without the student; results are shown only after the evaluation closes and only for
 * courses with enough answers that no single student can be picked out.
 */

/** Fewest answers before any result of a course is shown. */
export const MIN_EVALUATION_RESPONSES = 3;

export const EVALUATION_QUESTIONS = [
  { id: 'outline', text: 'The course outline and objectives were explained at the start.' },
  { id: 'prepared', text: 'The teacher came to class prepared and on time.' },
  { id: 'clear', text: 'Concepts were explained clearly, with examples.' },
  { id: 'questions', text: 'Questions were welcome and the teacher was approachable.' },
  { id: 'fair', text: 'Assessments matched what was taught, and grading was fair.' },
  { id: 'feedback', text: 'Marked work came back on time with useful feedback.' },
  { id: 'available', text: 'The teacher was available in office hours.' },
  { id: 'overall', text: 'Overall, I would recommend this teacher.' },
] as const;

export const LIKERT_LABELS = [
  'Strongly disagree',
  'Disagree',
  'Neutral',
  'Agree',
  'Strongly agree',
] as const;

export interface EvaluationAnswers {
  /** One rating per question, 1 (strongly disagree) to 5 (strongly agree), in question order. */
  ratings: readonly number[];
  wentWell?: string | null;
  improve?: string | null;
}

export interface QuestionSummary {
  id: string;
  text: string;
  /** Average rating, one decimal. */
  average: number;
  /** How many answered 1, 2, 3, 4 and 5. */
  counts: [number, number, number, number, number];
}

export interface EvaluationSummary {
  responses: number;
  /** Average over every question, one decimal. */
  overall: number;
  questions: QuestionSummary[];
  wentWell: string[];
  improve: string[];
}

const oneDecimal = (value: number) => Math.round(value * 10) / 10;

/** Averages, rating counts and comments of a course's answers (any order in, same result). */
export function summarizeEvaluation(answers: readonly EvaluationAnswers[]): EvaluationSummary {
  const questions = EVALUATION_QUESTIONS.map((q, index): QuestionSummary => {
    const counts: [number, number, number, number, number] = [0, 0, 0, 0, 0];
    let sum = 0;
    let n = 0;
    for (const answer of answers) {
      const rating = answer.ratings[index];
      if (!rating || rating < 1 || rating > 5) continue;
      counts[rating - 1] = (counts[rating - 1] ?? 0) + 1;
      sum += rating;
      n++;
    }
    return { id: q.id, text: q.text, average: n ? oneDecimal(sum / n) : 0, counts };
  });
  const rated = questions.filter((q) => q.counts.some(Boolean));
  const comments = (pick: (a: EvaluationAnswers) => string | null | undefined) =>
    answers
      .map(pick)
      .filter((c): c is string => !!c?.trim())
      .map((c) => c.trim())
      // Alphabetical, so the order says nothing about who answered when.
      .sort((a, b) => a.localeCompare(b));
  return {
    responses: answers.length,
    overall: rated.length
      ? oneDecimal(rated.reduce((sum, q) => sum + q.average, 0) / rated.length)
      : 0,
    questions,
    wentWell: comments((a) => a.wentWell),
    improve: comments((a) => a.improve),
  };
}
