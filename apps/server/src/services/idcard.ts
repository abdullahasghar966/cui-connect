/**
 * Digital ID cards and their public check.
 *
 * The QR on a card holds a random code: not the person's id (an ObjectId says when the account was
 * made) and nothing that could be guessed. Scanning it opens `/verify/<code>`, which anyone can
 * open without signing in. A valid card shows what is printed on it (name, student/faculty/staff,
 * registration number or designation, department) and the photo, so a guard can compare faces;
 * a card that is not valid shows nothing about anyone.
 *
 * A replacement card (Student Affairs completing a lost-card request, or IT issuing one) gets a new
 * code, so the old card stops verifying at once. A deactivated account's card is not valid.
 */
import { randomBytes } from 'node:crypto';
import type { Readable } from 'node:stream';
import {
  campusClock,
  ID_CARD_CODE_PATTERN,
  type IdCardCheckDTO,
  type IdCardDTO,
  idCardStatus,
  OFFICE_LABELS,
  studentCardValidUntil,
} from '@cui/shared';
import type { Types } from 'mongoose';
import { notFound } from '../lib/errors';
import {
  Department,
  type IdCard,
  Program,
  Section,
  type StoredFileDoc,
  User,
  type UserDoc,
} from '../models';
import { recordAudit } from './audit';
import { openProfilePhoto } from './files';
import { photoUrlOf, toObjectId } from './mappers';
import { notify } from './notifications';
import { currentTerm } from './terms';

const newCode = () => randomBytes(18).toString('base64url');

/** The band across the card. */
function cardKind(user: UserDoc): string {
  switch (user.role) {
    case 'student':
      return 'Student';
    case 'faculty':
      return 'Faculty';
    case 'staff':
      return 'Staff';
    case 'admin':
      return 'IT Services';
  }
}

function designationOf(user: UserDoc): string | null {
  if (user.role === 'student') return null;
  return user.designation ?? (user.office ? OFFICE_LABELS[user.office] : null);
}

/** Students: the end of their programme (see `studentCardValidUntil`); everyone else: no end. */
async function validUntilFor(user: UserDoc): Promise<string | null> {
  if (user.role !== 'student') return null;
  const [term, section] = await Promise.all([
    currentTerm(),
    user.sectionId ? Section.findById(user.sectionId).select('intake').lean() : null,
  ]);
  return section ? studentCardValidUntil(section.intake, term.code) : term.endsOn;
}

/** A new card for this person: the next issue number, a new code and a fresh end date. */
export async function newIdCard(user: UserDoc, issuedAt = new Date()): Promise<IdCard> {
  return {
    code: newCode(),
    issue: (user.idCard?.issue ?? 0) + 1,
    issuedAt,
    validUntil: await validUntilFor(user),
  };
}

async function cardDetails(user: UserDoc) {
  const [department, section] = await Promise.all([
    user.departmentId ? Department.findById(user.departmentId).select('name').lean() : null,
    user.sectionId ? Section.findById(user.sectionId).select('name program').lean() : null,
  ]);
  const programme = section
    ? await Program.findOne({ code: section.program }).select('name').lean()
    : null;
  return {
    department: department?.name ?? null,
    sectionName: section?.name ?? null,
    programme: programme?.name ?? null,
  };
}

async function toIdCardDTO(user: UserDoc, card: IdCard): Promise<IdCardDTO> {
  return {
    name: user.name,
    photoUrl: photoUrlOf(user),
    role: user.role,
    kind: cardKind(user),
    regNo: user.regNo ?? null,
    designation: designationOf(user),
    ...(await cardDetails(user)),
    issue: card.issue,
    issuedOn: campusClock(card.issuedAt).date,
    validUntil: card.validUntil,
    status: idCardStatus({ active: user.active, validUntil: card.validUntil }, campusClock().date),
    code: card.code,
  };
}

/** The viewer's card, issued the first time they open it. */
export async function myIdCard(viewer: UserDoc): Promise<IdCardDTO> {
  let user = await User.findById(viewer._id).lean<UserDoc>();
  if (!user) throw notFound('Account not found.');
  if (!user.idCard) {
    // Only if there is still no card, so two tabs opening it at once end up with the same one.
    await User.updateOne(
      { _id: user._id, idCard: null },
      { $set: { idCard: await newIdCard(user) } },
    );
    user = await User.findById(viewer._id).lean<UserDoc>();
  }
  if (!user?.idCard) throw notFound('Account not found.');
  return toIdCardDTO(user, user.idCard);
}

/** Replaces someone's card: the old code stops verifying. Returns the new card. */
export async function reissueIdCard(userId: Types.ObjectId): Promise<IdCard | null> {
  const user = await User.findById(userId).lean<UserDoc>();
  if (!user) return null;
  const card = await newIdCard(user);
  await User.updateOne({ _id: user._id }, { $set: { idCard: card } });
  return card;
}

/** IT issues a new card (faculty and staff have no request form for it). */
export async function issueIdCardByIT(actor: UserDoc, userId: string): Promise<IdCardDTO> {
  const card = await reissueIdCard(toObjectId(userId));
  const user = await User.findById(toObjectId(userId)).lean<UserDoc>();
  if (!card || !user) throw notFound('User not found.');
  void recordAudit({
    action: 'idcard.issued',
    actor,
    summary: `${actor.name} issued ID card ${card.issue} to ${user.name}`,
    targetType: 'user',
    targetId: user._id,
  });
  await notify([user._id], {
    type: 'system',
    title: 'You have a new ID card',
    body: 'Your card has a new QR code. Your old card no longer verifies.',
    link: '/me/id-card',
  });
  return toIdCardDTO(user, card);
}

async function cardFor(code: string): Promise<{ user: UserDoc; card: IdCard } | null> {
  if (!ID_CARD_CODE_PATTERN.test(code)) return null;
  const user = await User.findOne({ 'idCard.code': code }).lean<UserDoc>();
  return user?.idCard ? { user, card: user.idCard } : null;
}

const statusOf = ({ user, card }: { user: UserDoc; card: IdCard }) =>
  idCardStatus({ active: user.active, validUntil: card.validUntil }, campusClock().date);

/** The public check behind `/verify/<code>`. */
export async function checkIdCard(code: string): Promise<IdCardCheckDTO> {
  const checkedAt = new Date().toISOString();
  const found = await cardFor(code);
  if (!found) return { status: 'invalid', checkedAt, holder: null };
  const status = statusOf(found);
  if (status !== 'valid') return { status, checkedAt, holder: null };
  const { user, card } = found;
  return {
    status,
    checkedAt,
    holder: {
      name: user.name,
      kind: cardKind(user),
      number: user.regNo ?? designationOf(user),
      department: (await cardDetails(user)).department,
      validUntil: card.validUntil,
      issue: card.issue,
      hasPhoto: !!user.photoId,
    },
  };
}

/** The holder's photo, only while the card is valid. */
export async function idCardPhoto(
  code: string,
): Promise<{ file: StoredFileDoc; stream: Readable }> {
  const found = await cardFor(code);
  if (!found?.user.photoId || statusOf(found) !== 'valid') throw notFound('No photo.');
  return openProfilePhoto(found.user.photoId);
}
