/**
 * Fee challans for the demo campus. Every earlier term since a student's intake was paid in full.
 * This term is split in two instalments: the first (due a week before classes) is paid by
 * everyone, one student late with the late fee; the second is due on the calendar's fee deadline
 * and most have paid it, but Ahmed (FA23-BCS-003), Usman (FA23-BCS-031) and a few others haven't.
 */
import {
  addDays,
  amountOn,
  campusClock,
  campusInstant,
  challanNumber,
  type FeeInstalment,
  feeItemsFor,
  LATE_FEE,
  termIndex,
} from '@cui/shared';
import type { Types } from 'mongoose';
import { FeeChallan, Section, Term, type TermDoc, User } from '../models';
import { CALENDAR } from './academic-data';

/** The calendar's fee deadline is the second instalment's due date. */
const SECOND_DUE =
  CALENDAR.find((e) => e.kind === 'deadline' && /fee/i.test(e.title))?.startsOn ?? '2026-10-30';
const UNPAID = new Set(['FA23-BCS-003', 'FA23-BCS-031']);
/** Never unpaid by the "a few others" rule (the demo accounts' stories stay simple). */
const ALWAYS_PAID = new Set(['FA23-BCS-001', 'FA23-BCS-002', 'FA23-BCS-033']);
const PAID_LATE = 'FA23-BCS-033';

const earlier = (a: string, b: string) => (a < b ? a : b);

export async function seedFees(today = campusClock().date): Promise<number> {
  const [terms, students, sections, accounts] = await Promise.all([
    Term.find().lean<TermDoc[]>(),
    User.find({ role: 'student', active: true })
      .select('regNo sectionId')
      .sort({ regNo: 1 })
      .lean<{ _id: Types.ObjectId; regNo: string | null; sectionId: Types.ObjectId | null }[]>(),
    Section.find().select('intake').lean(),
    User.findOne({ role: 'staff', office: 'ACCOUNTS' }).select('_id').lean(),
  ]);
  const current = terms.find((t) => t.current);
  if (!current) return 0;
  const intakeOf = new Map(sections.map((s) => [String(s._id), s.intake]));
  const clerk = accounts?._id ?? null;
  const docs: Record<string, unknown>[] = [];

  const challan = (
    student: (typeof students)[number],
    term: TermDoc,
    instalment: FeeInstalment,
    issuedOn: string,
    dueDate: string,
    paidOn: string | null,
    n: number,
  ) => {
    const items = feeItemsFor(instalment);
    const issuedAt = campusInstant(issuedOn, '09:00');
    docs.push({
      studentId: student._id,
      termId: term._id,
      instalment,
      challanNo: challanNumber(term.code, student.regNo ?? String(student._id), instalment),
      items,
      dueDate,
      lateFee: LATE_FEE,
      issuedById: clerk,
      paidOn,
      amountPaid: paidOn ? amountOn({ items, dueDate, lateFee: LATE_FEE }, paidOn) : null,
      // A different slip number for every payment.
      bankRef: paidOn
        ? `BR-${String(400_000 + ((n * 7_919 + docs.length * 104_729) % 600_000))}`
        : null,
      markedById: paidOn ? clerk : null,
      createdAt: issuedAt,
      updatedAt: paidOn ? campusInstant(paidOn, '15:00') : issuedAt,
    });
  };

  for (const [n, student] of students.entries()) {
    const intake = student.sectionId ? intakeOf.get(String(student.sectionId)) : undefined;
    const regNo = student.regNo ?? '';
    // Earlier terms: paid in full a few days before the deadline.
    for (const term of terms) {
      if (term.current || !intake || termIndex(term.code) < termIndex(intake)) continue;
      if (termIndex(term.code) > termIndex(current.code)) continue;
      const due = addDays(term.startsOn, -7);
      challan(student, term, 'full', addDays(due, -21), due, addDays(due, -(n % 9)), n);
    }

    // This term, first instalment (late for one student, so the late fee shows).
    const firstDue = addDays(current.startsOn, -7);
    const firstPaid = regNo === PAID_LATE ? addDays(firstDue, 2) : addDays(firstDue, -(n % 12));
    challan(
      student,
      current,
      'first',
      addDays(firstDue, -21),
      firstDue,
      firstPaid <= today ? firstPaid : null,
      n,
    );

    // Second instalment: issued four weeks before the deadline; most paid since.
    const issued = addDays(SECOND_DUE, -29);
    const unpaid = UNPAID.has(regNo) || (!ALWAYS_PAID.has(regNo) && n % 9 === 4);
    const latest = earlier(addDays(today, -1), SECOND_DUE);
    let secondPaid: string | null = null;
    if (!unpaid && latest >= issued) {
      const day = addDays(latest, -(n % 9));
      secondPaid = day < issued ? issued : day;
    }
    if (issued <= today) challan(student, current, 'second', issued, SECOND_DUE, secondPaid, n);
  }

  if (docs.length) await FeeChallan.collection.insertMany(docs);
  return docs.length;
}
