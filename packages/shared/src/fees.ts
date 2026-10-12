/**
 * Semester fees: what a challan holds, when it is due, paid or overdue, and how money is written
 * on it. Fees are display-only: students pay at the bank and the Accounts Office records it.
 */

export const FEE_INSTALMENTS = ['full', 'first', 'second'] as const;
export type FeeInstalment = (typeof FEE_INSTALMENTS)[number];

export const FEE_INSTALMENT_LABELS: Record<FeeInstalment, string> = {
  full: 'Full semester fee',
  first: 'First instalment',
  second: 'Second instalment',
};

/** A full-semester challan can't sit next to instalments of the same term, and vice versa. */
export function instalmentsClash(a: FeeInstalment, b: FeeInstalment): boolean {
  return a === b || a === 'full' || b === 'full';
}

export interface FeeItem {
  label: string;
  amount: number;
}

/** One semester of a BS programme (Rs 123,500), the default when challans are issued. */
export const DEFAULT_FEE_ITEMS: readonly FeeItem[] = [
  { label: 'Tuition fee', amount: 102_000 },
  { label: 'Examination fee', amount: 6_000 },
  { label: 'Laboratory fee', amount: 6_500 },
  { label: 'Library fee', amount: 3_000 },
  { label: 'IT services fee', amount: 2_000 },
  { label: 'Student activities fee', amount: 2_500 },
  { label: 'Medical fee', amount: 1_500 },
];

/**
 * The default items of each kind of challan: the first instalment carries half the tuition and
 * every other charge, the second the rest of the tuition.
 */
export function feeItemsFor(
  instalment: FeeInstalment,
  base: readonly FeeItem[] = DEFAULT_FEE_ITEMS,
): FeeItem[] {
  if (instalment === 'full') return base.map((item) => ({ ...item }));
  const [tuition, ...rest] = base;
  if (!tuition) return [];
  const half = Math.ceil(tuition.amount / 2);
  return instalment === 'first'
    ? [{ label: `${tuition.label} (first half)`, amount: half }, ...rest.map((i) => ({ ...i }))]
    : [{ label: `${tuition.label} (second half)`, amount: tuition.amount - half }];
}

/** Charged once on top of the challan when it is paid after the due date. */
export const LATE_FEE = 1_000;
/** Students hear about an unpaid challan this many days before it is due. */
export const FEE_REMINDER_DAYS = 3;

export const FEE_STATUSES = ['due', 'overdue', 'paid'] as const;
export type FeeStatus = (typeof FEE_STATUSES)[number];

export const FEE_STATUS_LABELS: Record<FeeStatus, string> = {
  due: 'Due',
  overdue: 'Overdue',
  paid: 'Paid',
};

export const feeTotal = (items: readonly FeeItem[]) =>
  items.reduce((sum, item) => sum + item.amount, 0);

/** Paid once a payment is recorded; overdue from the day after the due date (campus dates). */
export function feeStatus(
  challan: { dueDate: string; paidOn: string | null },
  today: string,
): FeeStatus {
  if (challan.paidOn) return 'paid';
  return today > challan.dueDate ? 'overdue' : 'due';
}

/** What a challan costs if paid on `day`: the late fee is added after the due date. */
export function amountOn(
  challan: { items: readonly FeeItem[]; dueDate: string; lateFee: number },
  day: string,
): number {
  return feeTotal(challan.items) + (day > challan.dueDate ? challan.lateFee : 0);
}

const rupees = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** `123500` → `Rs 123,500`. */
export const formatPKR = (amount: number) => `Rs ${rupees.format(amount)}`;

const ONES = [
  '',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function underHundred(n: number): string {
  if (n < 20) return ONES[n] ?? '';
  const unit = n % 10;
  return `${TENS[Math.floor(n / 10)] ?? ''}${unit ? `-${ONES[unit] ?? ''}` : ''}`;
}

function underThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [hundreds ? `${ONES[hundreds]} hundred` : '', rest ? underHundred(rest) : '']
    .filter(Boolean)
    .join(' ');
}

/**
 * The amount in words as Pakistani challans write it (lakh and crore):
 * `123500` → `One lakh twenty-three thousand five hundred rupees only`.
 */
export function amountInWords(amount: number): string {
  let n = Math.round(Math.abs(amount));
  if (n === 0) return 'Zero rupees only';
  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  const thousand = Math.floor(n / 1_000);
  n %= 1_000;
  const words = [
    crore ? `${crore < 1_000 ? underThousand(crore) : rupees.format(crore)} crore` : '',
    lakh ? `${underHundred(lakh)} lakh` : '',
    thousand ? `${underHundred(thousand)} thousand` : '',
    n ? underThousand(n) : '',
  ]
    .filter(Boolean)
    .join(' ');
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} rupees only`;
}

const INSTALMENT_CODE: Record<FeeInstalment, string> = { full: 'F', first: '1', second: '2' };

/** A readable, unique challan number: `FA26-FA23BCS001-2`. */
export function challanNumber(termCode: string, studentKey: string, instalment: FeeInstalment) {
  return `${termCode}-${studentKey.replace(/[^A-Za-z0-9]/g, '').toUpperCase()}-${INSTALMENT_CODE[instalment]}`;
}

/** Printed on every challan. */
export const FEE_PAYMENT_NOTE =
  "Payable at any branch of the university's designated banks. The bank keeps its copy, the Accounts Office gets theirs, and you keep the student copy as your receipt.";
