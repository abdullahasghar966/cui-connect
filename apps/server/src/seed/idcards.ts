/**
 * Everyone already has an ID card: students since the start of their first term, faculty and staff
 * since the start of this one. Usman's lost card (`seed/requests.ts`) is his first, so Student
 * Affairs completing his request in the demo replaces it and the old QR stops verifying.
 */
import { defaultTermDates } from '@cui/shared';
import type { AnyBulkWriteOperation } from 'mongoose';
import { Section, type SectionDoc, User, type UserDoc } from '../models';
import { newIdCard } from '../services/idcard';
import { currentTerm } from '../services/terms';

/** 10:00 in Pakistan on that day. */
const morningOf = (day: string) => new Date(`${day}T05:00:00Z`);

export async function seedIdCards(): Promise<number> {
  const [users, sections, term] = await Promise.all([
    User.find().lean<UserDoc[]>(),
    Section.find().lean<SectionDoc[]>(),
    currentTerm(),
  ]);
  const intakeOf = new Map(sections.map((s) => [String(s._id), s.intake]));
  const ops: AnyBulkWriteOperation<UserDoc>[] = [];
  for (const user of users) {
    const intake = user.sectionId ? intakeOf.get(String(user.sectionId)) : undefined;
    const issuedAt = morningOf(intake ? defaultTermDates(intake).startsOn : term.startsOn);
    ops.push({
      updateOne: {
        filter: { _id: user._id },
        update: { $set: { idCard: await newIdCard(user, issuedAt) } },
      },
    });
  }
  if (ops.length) await User.bulkWrite(ops);
  return ops.length;
}
