/**
 * Course registration for the demo campus: next term's offers for every section from the degree
 * plans, with teachers from each department chosen so nobody teaches two classes at once.
 * Registration is opened early (by hand) so it can be tried any day. Three plans exist: Ali's is
 * approved, Ahmed's waits for Dr. Imran Haider, and Usman's was returned by his advisor. Hira
 * hasn't registered yet, which is the demo.
 */
import { type OfferSlot, timesOverlap } from '@cui/shared';
import type { Types } from 'mongoose';
import {
  CampusSettings,
  Registration,
  RegistrationOffer,
  type RegistrationOfferDoc,
  Section,
  type SectionDoc,
  User,
  type UserDoc,
} from '../models';
import { sameId } from '../services/mappers';
import { createPlannedOffers, ensureNextTerm } from '../services/registration';
import { routeFor } from '../services/requests';
import { invalidateCampusSettings } from '../services/settings';

const DAY = 24 * 60 * 60 * 1000;

export async function seedRegistration(now = new Date()): Promise<number> {
  const term = await ensureNextTerm();
  await CampusSettings.updateOne(
    { _id: 'campus' },
    { $set: { registrationMode: 'open' } },
    { upsert: true },
  );
  invalidateCampusSettings();
  await createPlannedOffers(await Section.find().sort({ name: 1 }).lean<SectionDoc[]>(), term);

  // Teachers: each department's faculty in turn, skipping anyone already busy at those times.
  const offers = await RegistrationOffer.find({ termId: term._id })
    .sort({ sectionId: 1, code: 1 })
    .lean<RegistrationOfferDoc[]>();
  const faculty = await User.find({ role: 'faculty', active: true })
    .select('departmentId')
    .sort({ email: 1 })
    .lean<Pick<UserDoc, '_id' | 'departmentId'>[]>();
  const busy = new Map<string, OfferSlot[]>();
  let turn = 0;
  for (const offer of offers) {
    const pool = faculty.filter((f) => sameId(f.departmentId, offer.departmentId));
    for (let i = 0; i < pool.length; i++) {
      const teacher = pool[(turn + i) % pool.length];
      if (!teacher) continue;
      const mine = busy.get(String(teacher._id)) ?? [];
      const clash = offer.slots.some((s) =>
        mine.some((m) => m.day === s.day && timesOverlap(m.start, m.end, s.start, s.end)),
      );
      if (clash) continue;
      busy.set(String(teacher._id), [...mine, ...offer.slots]);
      offer.instructorId = teacher._id;
      await RegistrationOffer.updateOne(
        { _id: offer._id },
        { $set: { instructorId: teacher._id } },
      );
      turn++;
      break;
    }
  }

  const students = await User.find({
    regNo: { $in: ['FA23-BCS-001', 'FA23-BCS-003', 'FA23-BCS-031'] },
  }).lean<UserDoc[]>();
  const by = (regNo: string) => students.find((s) => s.regNo === regNo);
  const ali = by('FA23-BCS-001');
  const ahmed = by('FA23-BCS-003');
  const usman = by('FA23-BCS-031');
  if (!ali || !ahmed || !usman) return offers.length;
  const sectionOffers = (student: UserDoc) =>
    offers.filter((o) => sameId(o.sectionId, student.sectionId)).map((o) => o._id);
  const advisorOf = async (student: UserDoc) => {
    const section = await Section.findById(student.sectionId).select('batchAdvisorId').lean();
    return section?.batchAdvisorId
      ? await User.findById(section.batchAdvisorId)
          .select('name')
          .lean<{ _id: Types.ObjectId; name: string }>()
      : null;
  };
  const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * DAY);
  const sent = (student: UserDoc, daysAgo: number, count: number) => ({
    at: at(daysAgo),
    byId: student._id,
    byName: student.name,
    kind: 'submitted' as const,
    body: `${count} courses`,
  });

  const docs: Record<string, unknown>[] = [];
  const aliOffers = sectionOffers(ali);
  const aliAdvisor = await advisorOf(ali);
  docs.push({
    studentId: ali._id,
    termId: term._id,
    offerIds: aliOffers,
    status: 'approved',
    route: await routeFor(ali, 'leave'),
    heldOfferIds: aliOffers,
    submittedAt: at(3),
    events: [
      sent(ali, 3, aliOffers.length),
      {
        at: at(2),
        byId: aliAdvisor?._id ?? null,
        byName: aliAdvisor?.name ?? null,
        kind: 'approved',
        body: 'All good. Keep up the work on your final year project.',
      },
    ],
  });
  const ahmedOffers = sectionOffers(ahmed);
  docs.push({
    studentId: ahmed._id,
    termId: term._id,
    offerIds: ahmedOffers,
    status: 'submitted',
    route: await routeFor(ahmed, 'leave'),
    heldOfferIds: ahmedOffers,
    submittedAt: at(1),
    events: [sent(ahmed, 1, ahmedOffers.length)],
  });
  const usmanOffers = sectionOffers(usman);
  const usmanAdvisor = await advisorOf(usman);
  docs.push({
    studentId: usman._id,
    termId: term._id,
    offerIds: usmanOffers,
    status: 'returned',
    route: await routeFor(usman, 'leave'),
    heldOfferIds: [],
    submittedAt: at(2),
    events: [
      sent(usman, 2, usmanOffers.length),
      {
        at: at(1),
        byId: usmanAdvisor?._id ?? null,
        byName: usmanAdvisor?.name ?? null,
        kind: 'returned',
        body: 'Add an elective so you reach at least 12 credit hours, then send it again.',
      },
    ],
  });
  await Registration.insertMany(docs);
  for (const id of [...aliOffers, ...ahmedOffers]) {
    await RegistrationOffer.updateOne({ _id: id }, { $inc: { seatsTaken: 1 } });
  }
  return offers.length;
}
