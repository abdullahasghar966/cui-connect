import { describe, expect, it } from 'vitest';
import { issueChallansSchema } from './academic-schemas';
import {
  amountInWords,
  amountOn,
  challanNumber,
  DEFAULT_FEE_ITEMS,
  feeItemsFor,
  feeStatus,
  feeTotal,
  formatPKR,
  instalmentsClash,
  LATE_FEE,
} from './fees';

describe('fees', () => {
  it('splits a semester into two instalments that add up to the full fee', () => {
    const full = feeTotal(feeItemsFor('full'));
    expect(full).toBe(123_500);
    expect(feeTotal(feeItemsFor('first'))).toBe(72_500);
    expect(feeTotal(feeItemsFor('second'))).toBe(51_000);
    expect(feeTotal(feeItemsFor('first')) + feeTotal(feeItemsFor('second'))).toBe(full);
    expect(feeItemsFor('second')).toEqual([{ label: 'Tuition fee (second half)', amount: 51_000 }]);
    // An odd tuition still adds up.
    const odd = [{ label: 'Tuition fee', amount: 1_001 }];
    expect(feeTotal(feeItemsFor('first', odd)) + feeTotal(feeItemsFor('second', odd))).toBe(1_001);
    // The defaults are never changed by callers.
    const copy = feeItemsFor('full');
    if (copy[0]) copy[0].amount = 1;
    expect(DEFAULT_FEE_ITEMS[0]?.amount).toBe(102_000);
  });

  it('is due until the due date, overdue after it, and paid once recorded', () => {
    const challan = { dueDate: '2026-10-30', paidOn: null };
    expect(feeStatus(challan, '2026-10-30')).toBe('due');
    expect(feeStatus(challan, '2026-10-31')).toBe('overdue');
    expect(feeStatus({ ...challan, paidOn: '2026-11-02' }, '2026-11-05')).toBe('paid');

    const items = [{ label: 'Tuition fee', amount: 51_000 }];
    expect(amountOn({ items, dueDate: '2026-10-30', lateFee: LATE_FEE }, '2026-10-30')).toBe(
      51_000,
    );
    expect(amountOn({ items, dueDate: '2026-10-30', lateFee: LATE_FEE }, '2026-10-31')).toBe(
      52_000,
    );
  });

  it('never lets a full-semester challan sit next to instalments of the same term', () => {
    expect(instalmentsClash('first', 'second')).toBe(false);
    expect(instalmentsClash('first', 'first')).toBe(true);
    expect(instalmentsClash('full', 'second')).toBe(true);
    expect(instalmentsClash('first', 'full')).toBe(true);
  });

  it('writes amounts the way a Pakistani challan does', () => {
    expect(formatPKR(123_500)).toBe('Rs 123,500');
    expect(amountInWords(123_500)).toBe('One lakh twenty-three thousand five hundred rupees only');
    expect(amountInWords(51_000)).toBe('Fifty-one thousand rupees only');
    expect(amountInWords(72_500)).toBe('Seventy-two thousand five hundred rupees only');
    expect(amountInWords(1_000)).toBe('One thousand rupees only');
    expect(amountInWords(25_00_00_019)).toBe('Twenty-five crore nineteen rupees only');
    expect(amountInWords(0)).toBe('Zero rupees only');
    expect(challanNumber('FA26', 'FA23-BCS-001', 'second')).toBe('FA26-FA23BCS001-2');
  });

  it('accepts a challan run only with a target and a sensible bill', () => {
    const base = {
      instalment: 'second',
      dueDate: '2026-10-30',
      items: feeItemsFor('second'),
    } as const;
    expect(issueChallansSchema.safeParse({ ...base, scope: 'campus' }).success).toBe(true);
    expect(issueChallansSchema.safeParse({ ...base, scope: 'section' }).success).toBe(false);
    expect(
      issueChallansSchema.safeParse({
        ...base,
        scope: 'section',
        sectionId: '64b7f0c2a1b2c3d4e5f60718',
      }).success,
    ).toBe(true);
    expect(
      issueChallansSchema.safeParse({
        ...base,
        scope: 'campus',
        items: [{ label: 'Tuition fee', amount: 0 }],
      }).success,
    ).toBe(false);
    expect(issueChallansSchema.safeParse({ ...base, scope: 'campus' }).data?.lateFee).toBe(
      LATE_FEE,
    );
  });
});
