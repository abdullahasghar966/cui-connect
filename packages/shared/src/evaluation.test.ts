import { describe, expect, it } from 'vitest';
import { evaluationSchema } from './academic-schemas';
import { canViewEvaluation, type OfferingFacts } from './access';
import { EVALUATION_QUESTIONS, summarizeEvaluation } from './evaluation';
import type { PolicyUser } from './policy';

const all = (rating: number) => EVALUATION_QUESTIONS.map(() => rating);

describe('teacher evaluation', () => {
  it('averages each question, counts ratings and keeps comments in an order that says nothing', () => {
    const summary = summarizeEvaluation([
      { ratings: all(5), wentWell: '  Great labs. ', improve: null },
      { ratings: all(4), wentWell: 'Clear examples.', improve: 'Return marks sooner.' },
      { ratings: [3, 3, 3, 3, 3, 3, 3, 2], wentWell: '', improve: null },
    ]);
    expect(summary.responses).toBe(3);
    expect(summary.questions[0]).toMatchObject({
      id: 'outline',
      average: 4,
      counts: [0, 0, 1, 1, 1],
    });
    expect(summary.questions[7]).toMatchObject({
      id: 'overall',
      average: 3.7,
      counts: [0, 1, 0, 1, 1],
    });
    expect(summary.overall).toBe(4);
    expect(summary.wentWell).toEqual(['Clear examples.', 'Great labs.']);
    expect(summary.improve).toEqual(['Return marks sooner.']);
    expect(summarizeEvaluation([]).overall).toBe(0);
  });

  it('needs a rating from 1 to 5 for every question', () => {
    expect(evaluationSchema.safeParse({ ratings: all(4) }).success).toBe(true);
    expect(evaluationSchema.safeParse({ ratings: all(4).slice(1) }).success).toBe(false);
    expect(evaluationSchema.safeParse({ ratings: all(6) }).success).toBe(false);
    expect(evaluationSchema.safeParse({ ratings: all(0) }).success).toBe(false);
  });

  it("shows results to the course's teacher, its HOD, the Director's Office and IT only", () => {
    const user = (u: Partial<PolicyUser> & Pick<PolicyUser, 'id' | 'role'>): PolicyUser => ({
      active: true,
      departmentId: 'cs',
      ...u,
    });
    const awt: OfferingFacts = { instructorId: 'imran', sectionId: '7A', departmentId: 'cs' };
    const allowed = (u: PolicyUser) => canViewEvaluation(u, awt).allowed;
    expect(allowed(user({ id: 'imran', role: 'faculty' }))).toBe(true);
    expect(allowed(user({ id: 'fatima', role: 'faculty' }))).toBe(false);
    expect(allowed(user({ id: 'hod', role: 'faculty', isHOD: true }))).toBe(true);
    expect(allowed(user({ id: 'hod-ee', role: 'faculty', isHOD: true, departmentId: 'ee' }))).toBe(
      false,
    );
    expect(
      allowed(user({ id: 'dir', role: 'staff', office: 'DIRECTOR', departmentId: null })),
    ).toBe(true);
    expect(allowed(user({ id: 'admin', role: 'admin', departmentId: null }))).toBe(true);
    expect(allowed(user({ id: 'exam', role: 'staff', office: 'EXAM', departmentId: null }))).toBe(
      false,
    );
    expect(allowed(user({ id: 'hira', role: 'student' }))).toBe(false);
  });
});
