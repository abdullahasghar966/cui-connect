/**
 * Digital ID cards. Each card carries a random code in its QR; the public verification page looks
 * the code up and says whether the card is genuine and still valid. A new card (after a lost-card
 * request, or when IT issues one) gets a new code, so the old card stops verifying at once.
 */
import { defaultTermDates, nextTermCode, termIndex } from './academics';

/** Semesters in a degree programme (all of ours are four-year BS programmes). */
export const PROGRAMME_SEMESTERS = 8;

export const ID_CARD_STATUSES = ['valid', 'expired', 'invalid'] as const;
export type IdCardStatus = (typeof ID_CARD_STATUSES)[number];

/** Card codes: 18 random bytes, base64url. Anything else is refused before the database is asked. */
export const ID_CARD_CODE_PATTERN = /^[A-Za-z0-9_-]{24}$/;

/**
 * A student card lasts until the end of the programme's last semester; someone still studying
 * after that gets a card that lasts until the end of the current term.
 */
export function studentCardValidUntil(
  intake: string,
  currentTerm: string,
  semesters = PROGRAMME_SEMESTERS,
): string {
  let last = intake;
  for (let i = 1; i < semesters; i++) last = nextTermCode(last);
  const term = termIndex(currentTerm) > termIndex(last) ? currentTerm : last;
  return defaultTermDates(term).endsOn;
}

const cardDateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** `'2027-07-15'` → `'15 Jul 2027'`, as printed on a card. */
export const formatCardDate = (date: string) =>
  cardDateFormat.format(new Date(`${date}T00:00:00Z`));

/** Valid while the account is active and, for a card with an end date, until that day. */
export function idCardStatus(
  card: { active: boolean; validUntil: string | null },
  today: string,
): IdCardStatus {
  if (!card.active) return 'invalid';
  if (card.validUntil && today > card.validUntil) return 'expired';
  return 'valid';
}
