/**
 * Teacher evaluation for the demo campus: open, with most students' answers already in for each
 * course. Every teacher has a typical level, so reports differ. Hira hasn't evaluated anything
 * (that is the demo) and Ali has evaluated every course.
 */
import { randomUUID } from 'node:crypto';
import { addDays, campusClock, EVALUATION_QUESTIONS } from '@cui/shared';
import {
  CampusSettings,
  CourseOffering,
  type CourseOfferingDoc,
  EvaluationReceipt,
  EvaluationSheet,
  User,
} from '../models';
import { getOrgLookup, sameId } from '../services/mappers';
import { invalidateCampusSettings } from '../services/settings';
import { currentTerm } from '../services/terms';

const WENT_WELL = [
  'Clear explanations with real examples.',
  'Labs were well organised and useful.',
  'Always ready to answer questions after class.',
  'The assignments taught me a lot.',
  'Slides and notes were shared on time.',
  'Explained difficult topics patiently.',
];
const IMPROVE = [
  'Please return quiz marks sooner.',
  'Classes sometimes ran into the break.',
  'More practice problems before the sessionals would help.',
  'The pace was a bit fast in the middle of the term.',
  'Office hours were hard to catch.',
];

export async function seedEvaluation(today = campusClock().date): Promise<number> {
  await CampusSettings.updateOne(
    { _id: 'campus' },
    { $set: { evaluationOpen: true } },
    { upsert: true },
  );
  invalidateCampusSettings();
  const [term, org, people] = await Promise.all([
    currentTerm(),
    getOrgLookup(),
    User.find({ regNo: { $in: ['FA23-BCS-001', 'FA23-BCS-002'] } })
      .select('regNo')
      .lean(),
  ]);
  const ali = people.find((p) => p.regNo === 'FA23-BCS-001');
  const hira = people.find((p) => p.regNo === 'FA23-BCS-002');
  const offerings = await CourseOffering.find({ termId: term._id }).lean<CourseOfferingDoc[]>();

  // A repeatable pseudo-random sequence, so every reseed tells the same story.
  let state = 7;
  const random = () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
  const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)] ?? null;

  const sheets: Record<string, unknown>[] = [];
  const receipts: Record<string, unknown>[] = [];
  for (const offering of offerings) {
    if (!offering.instructorId) continue;
    const level = 3.2 + (Number.parseInt(String(offering.instructorId).slice(-4), 16) % 14) / 10;
    const answered = offering.studentIds.filter(
      (id, i) => !sameId(id, hira?._id) && (sameId(id, ali?._id) || i % 5 !== 2),
    );
    sheets.push({
      _id: offering._id,
      termId: term._id,
      instructorId: offering.instructorId,
      departmentId: org.sections.get(String(offering.sectionId))?.departmentId ?? null,
      responses: answered.map(() => ({
        ratings: EVALUATION_QUESTIONS.map(() =>
          Math.min(5, Math.max(1, Math.round(level + (random() - 0.5) * 2.2))),
        ),
        wentWell: random() < 0.55 ? pick(WENT_WELL) : null,
        improve: random() < 0.4 ? pick(IMPROVE) : null,
      })),
    });
    for (const studentId of answered) {
      receipts.push({
        _id: randomUUID(),
        studentId,
        offeringId: offering._id,
        termId: term._id,
        day: addDays(today, -Math.floor(random() * 5)),
      });
    }
  }
  if (sheets.length) await EvaluationSheet.insertMany(sheets);
  if (receipts.length) await EvaluationReceipt.insertMany(receipts);
  return receipts.length;
}
