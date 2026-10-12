/**
 * Fees. The Accounts Office issues challans (to the whole campus, a department or a section),
 * records each payment when the bank's copy arrives, and can correct a record or withdraw an
 * unpaid challan; students see their challans, print them for the bank and hear about every
 * change. Display-only: no money moves through the system. Paying after the due date costs the
 * late fee on top. Nobody but the student and the Accounts Office (or IT) sees a student's fees.
 */
import {
  amountOn,
  campusClock,
  canManageFees,
  challanNumber,
  FEE_INSTALMENT_LABELS,
  type FeeChallanDTO,
  type FeeDeskDTO,
  type FeeDeskQuery,
  feeDeskQuerySchema,
  feeStatus,
  feeTotal,
  formatPKR,
  formatShortDate,
  type IssueChallansInput,
  type IssueChallansResultDTO,
  instalmentsClash,
  issueChallansSchema,
  type MarkPaidInput,
  type MyFeesDTO,
  markPaidSchema,
} from '@cui/shared';
import {
  assertAllowed,
  badRequest,
  conflict,
  isDuplicateKeyError,
  notFound,
  parse,
} from '../lib/errors';
import { containsText } from '../lib/text';
import { FeeChallan, type FeeChallanDoc, Term, type TermDoc, User, type UserDoc } from '../models';
import { recordAudit } from './audit';
import { getOrgLookup, toObjectId, toPolicyUser } from './mappers';
import { notify } from './notifications';
import { currentTerm } from './terms';

const LINK = '/services/fees';
/** Rows the fee desk sends at once (the stats always cover every match). */
const DESK_ROWS = 500;

type Student = Pick<UserDoc, '_id' | 'name' | 'regNo' | 'sectionId' | 'departmentId'>;
type TermRef = Pick<TermDoc, '_id' | 'code' | 'name'>;

const STATUS_ORDER = { overdue: 0, due: 1, paid: 2 } as const;

/** "Fall 2026 second instalment". */
const describe = (doc: Pick<FeeChallanDoc, 'instalment'>, term: TermRef | null | undefined) =>
  `${term?.name ?? 'Term'} ${FEE_INSTALMENT_LABELS[doc.instalment].toLowerCase()}`;

const assertManager = (actor: UserDoc) => assertAllowed(canManageFees(toPolicyUser(actor)));

async function toDTOs(docs: FeeChallanDoc[], today = campusClock().date): Promise<FeeChallanDTO[]> {
  const studentIds = [...new Set(docs.map((d) => String(d.studentId)))];
  const termIds = [...new Set(docs.map((d) => String(d.termId)))];
  const [students, terms, org] = await Promise.all([
    User.find({ _id: { $in: studentIds.map((id) => toObjectId(id)) } })
      .select('name regNo sectionId departmentId')
      .lean<Student[]>(),
    Term.find({ _id: { $in: termIds.map((id) => toObjectId(id)) } })
      .select('code name')
      .lean<TermRef[]>(),
    getOrgLookup(),
  ]);
  const studentById = new Map(students.map((s) => [String(s._id), s]));
  const termById = new Map(terms.map((t) => [String(t._id), t]));
  return docs.map((doc) => {
    const student = studentById.get(String(doc.studentId));
    const term = termById.get(String(doc.termId));
    const section = student?.sectionId ? org.sections.get(String(student.sectionId)) : undefined;
    const status = feeStatus(doc, today);
    return {
      id: String(doc._id),
      challanNo: doc.challanNo,
      term: { id: String(doc.termId), code: term?.code ?? '', name: term?.name ?? '' },
      instalment: doc.instalment,
      student: {
        id: String(doc.studentId),
        name: student?.name ?? 'Former student',
        regNo: student?.regNo ?? null,
        sectionName: section?.name ?? null,
        program: section?.program ?? null,
        departmentName: student?.departmentId
          ? (org.departments.get(String(student.departmentId))?.name ?? null)
          : null,
      },
      items: doc.items.map((item) => ({ label: item.label, amount: item.amount })),
      total: feeTotal(doc.items),
      lateFee: doc.lateFee,
      dueDate: doc.dueDate,
      status,
      payable: status === 'paid' ? (doc.amountPaid ?? feeTotal(doc.items)) : amountOn(doc, today),
      paidOn: doc.paidOn,
      bankRef: doc.bankRef,
      issuedAt: doc.createdAt.toISOString(),
    };
  });
}

async function toDTO(doc: FeeChallanDoc): Promise<FeeChallanDTO> {
  const [dto] = await toDTOs([doc]);
  if (!dto) throw notFound('Challan not found.');
  return dto;
}

async function loadChallan(challanId: string) {
  const doc = await FeeChallan.findById(toObjectId(challanId)).lean<FeeChallanDoc>();
  if (!doc) throw notFound('Challan not found.');
  const term = await Term.findById(doc.termId).select('code name').lean<TermRef>();
  return { doc, term };
}

// ---- Students ----

/** The viewer's own challans, newest first, and what they still owe today. */
export async function myFees(viewer: UserDoc): Promise<MyFeesDTO> {
  const docs = await FeeChallan.find({ studentId: viewer._id })
    .sort({ dueDate: -1 })
    .limit(60)
    .lean<FeeChallanDoc[]>();
  const challans = await toDTOs(docs);
  return {
    challans,
    outstanding: challans.filter((c) => c.status !== 'paid').reduce((sum, c) => sum + c.payable, 0),
  };
}

// ---- Accounts Office ----

/** This term's challans with totals, filtered by part of the campus, instalment, status or name. */
export async function feeDesk(actor: UserDoc, query: FeeDeskQuery | unknown): Promise<FeeDeskDTO> {
  assertManager(actor);
  const { departmentId, sectionId, instalment, status, q } = parse(feeDeskQuerySchema, query);
  const term = await currentTerm();
  const today = campusClock().date;

  const filter: Record<string, unknown> = { termId: term._id };
  if (instalment) filter.instalment = instalment;
  if (departmentId || sectionId) {
    filter.studentId = {
      $in: await User.find({
        role: 'student',
        ...(departmentId ? { departmentId: toObjectId(departmentId) } : {}),
        ...(sectionId ? { sectionId: toObjectId(sectionId) } : {}),
      }).distinct('_id'),
    };
  }
  if (q) {
    const pattern = containsText(q);
    const named = await User.find({
      role: 'student',
      $or: [{ name: pattern }, { regNo: pattern }],
    }).distinct('_id');
    filter.$or = [{ studentId: { $in: named } }, { challanNo: pattern }];
  }

  const docs = await FeeChallan.find(filter).lean<FeeChallanDoc[]>();
  const stats = {
    challans: docs.length,
    paid: 0,
    due: 0,
    overdue: 0,
    collected: 0,
    outstanding: 0,
  };
  for (const doc of docs) {
    const s = feeStatus(doc, today);
    stats[s]++;
    if (s === 'paid') stats.collected += doc.amountPaid ?? feeTotal(doc.items);
    else stats.outstanding += amountOn(doc, today);
  }
  const wanted = docs
    .filter((doc) => {
      const s = feeStatus(doc, today);
      return status === 'all' || (status === 'unpaid' ? s !== 'paid' : s === status);
    })
    .sort(
      (a, b) =>
        STATUS_ORDER[feeStatus(a, today)] - STATUS_ORDER[feeStatus(b, today)] ||
        a.dueDate.localeCompare(b.dueDate) ||
        a.challanNo.localeCompare(b.challanNo),
    );
  return {
    term: { id: String(term._id), code: term.code, name: term.name },
    stats,
    rows: await toDTOs(wanted.slice(0, DESK_ROWS), today),
    truncated: wanted.length > DESK_ROWS,
  };
}

/**
 * Issues one challan to every active student in the chosen part of the campus for the current
 * term. Students who already have this challan (or a full-semester one, or instalments when a
 * full one is issued) are skipped, so running it twice is harmless.
 */
export async function issueChallans(
  actor: UserDoc,
  input: IssueChallansInput,
): Promise<IssueChallansResultDTO> {
  assertManager(actor);
  const data = parse(issueChallansSchema, input);
  if (data.dueDate < campusClock().date) throw badRequest('The due date has already passed.');
  const term = await currentTerm();
  const students = await User.find({
    role: 'student',
    active: true,
    ...(data.scope === 'department' && data.departmentId
      ? { departmentId: toObjectId(data.departmentId) }
      : {}),
    ...(data.scope === 'section' && data.sectionId
      ? { sectionId: toObjectId(data.sectionId) }
      : {}),
  })
    .select('_id regNo')
    .lean<Pick<UserDoc, '_id' | 'regNo'>[]>();
  if (!students.length) throw badRequest('There are no active students there.');

  const existing = await FeeChallan.find({
    termId: term._id,
    studentId: { $in: students.map((s) => s._id) },
  })
    .select('studentId instalment')
    .lean<Pick<FeeChallanDoc, 'studentId' | 'instalment'>[]>();
  const taken = new Set(
    existing
      .filter((c) => instalmentsClash(c.instalment, data.instalment))
      .map((c) => String(c.studentId)),
  );
  const fresh = students.filter((s) => !taken.has(String(s._id)));
  if (fresh.length) {
    try {
      await FeeChallan.insertMany(
        fresh.map((s) => ({
          studentId: s._id,
          termId: term._id,
          instalment: data.instalment,
          challanNo: challanNumber(term.code, s.regNo ?? String(s._id).slice(-8), data.instalment),
          items: data.items,
          dueDate: data.dueDate,
          lateFee: data.lateFee,
          issuedById: actor._id,
        })),
      );
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        throw conflict(
          'These challans are being issued by someone else right now. Reload to see them.',
        );
      }
      throw err;
    }
    const total = feeTotal(data.items);
    await notify(
      fresh.map((s) => s._id),
      {
        type: 'fees',
        title: `Fee challan: ${describe(data, term)}`,
        body: `${formatPKR(total)} due by ${formatShortDate(data.dueDate)}. Print the challan from Fees and pay at the bank.`,
        link: LINK,
      },
    );
    void recordAudit({
      action: 'fees.issued',
      actor,
      summary: `${actor.name} issued ${fresh.length} fee challan${fresh.length === 1 ? '' : 's'} (${describe(data, term)}, ${formatPKR(total)} each)`,
      targetType: 'term',
      targetId: term._id,
    });
  }
  return { issued: fresh.length, skipped: students.length - fresh.length };
}

/** Records a payment (the late fee is added when it was paid after the due date). */
export async function markPaid(
  actor: UserDoc,
  challanId: string,
  input: MarkPaidInput,
): Promise<FeeChallanDTO> {
  assertManager(actor);
  const { paidOn, bankRef } = parse(markPaidSchema, input);
  if (paidOn > campusClock().date) throw badRequest("The payment date can't be in the future.");
  const { doc, term } = await loadChallan(challanId);
  const amountPaid = amountOn(doc, paidOn);
  // Conditional, so two clerks can't record the same payment twice.
  const updated = await FeeChallan.findOneAndUpdate(
    { _id: doc._id, paidOn: null },
    { $set: { paidOn, amountPaid, bankRef: bankRef || null, markedById: actor._id } },
    { returnDocument: 'after' },
  ).lean<FeeChallanDoc>();
  if (!updated) throw conflict('This challan is already marked as paid.');

  const late = amountPaid > feeTotal(doc.items);
  await notify([doc.studentId], {
    type: 'fees',
    title: `Fee received: ${formatPKR(amountPaid)}`,
    body: `${describe(doc, term)} (challan ${doc.challanNo}), paid on ${formatShortDate(paidOn)}${late ? ' with the late fee' : ''}. Thank you.`,
    link: LINK,
  });
  const student = await User.findById(doc.studentId).select('name').lean();
  void recordAudit({
    action: 'fees.paid',
    actor,
    summary: `${actor.name} recorded ${student?.name ?? 'a student'}'s fee payment (${formatPKR(amountPaid)}, challan ${doc.challanNo})`,
    targetType: 'challan',
    targetId: doc._id,
  });
  return toDTO(updated);
}

/** Undoes a payment recorded by mistake. */
export async function markUnpaid(actor: UserDoc, challanId: string): Promise<FeeChallanDTO> {
  assertManager(actor);
  const { doc, term } = await loadChallan(challanId);
  const updated = await FeeChallan.findOneAndUpdate(
    { _id: doc._id, paidOn: { $ne: null } },
    { $set: { paidOn: null, amountPaid: null, bankRef: null, markedById: actor._id } },
    { returnDocument: 'after' },
  ).lean<FeeChallanDoc>();
  if (!updated) throw conflict('This challan is not marked as paid.');
  await notify([doc.studentId], {
    type: 'fees',
    title: 'Fee record corrected',
    body: `Your ${describe(doc, term)} (challan ${doc.challanNo}) shows as unpaid again. If you have paid it, take your bank receipt to the Accounts Office.`,
    link: LINK,
  });
  const student = await User.findById(doc.studentId).select('name').lean();
  void recordAudit({
    action: 'fees.unpaid',
    actor,
    summary: `${actor.name} marked ${student?.name ?? 'a student'}'s challan ${doc.challanNo} as unpaid`,
    targetType: 'challan',
    targetId: doc._id,
  });
  return toDTO(updated);
}

/** Withdraws a challan issued by mistake (only while unpaid). */
export async function cancelChallan(actor: UserDoc, challanId: string): Promise<{ ok: true }> {
  assertManager(actor);
  const { doc, term } = await loadChallan(challanId);
  const { deletedCount } = await FeeChallan.deleteOne({ _id: doc._id, paidOn: null });
  if (!deletedCount) throw conflict("A paid challan can't be withdrawn. Mark it unpaid first.");
  await notify([doc.studentId], {
    type: 'fees',
    title: 'Fee challan withdrawn',
    body: `The Accounts Office withdrew your ${describe(doc, term)} (challan ${doc.challanNo}). You don't need to pay it.`,
    link: LINK,
  });
  const student = await User.findById(doc.studentId).select('name').lean();
  void recordAudit({
    action: 'fees.withdrawn',
    actor,
    summary: `${actor.name} withdrew ${student?.name ?? 'a student'}'s challan ${doc.challanNo}`,
    targetType: 'challan',
    targetId: doc._id,
  });
  return { ok: true };
}
