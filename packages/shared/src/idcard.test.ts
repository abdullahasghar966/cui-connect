import { describe, expect, it } from 'vitest';
import { ID_CARD_CODE_PATTERN, idCardStatus, studentCardValidUntil } from './idcard';

describe('ID cards', () => {
  it('lasts until the end of the programme, or this term for someone still studying', () => {
    // FA23 intake: the 8th semester is SP27.
    expect(studentCardValidUntil('FA23', 'FA26')).toBe('2027-07-15');
    expect(studentCardValidUntil('SP24', 'FA26')).toBe('2028-01-31');
    // An FA19 student still enrolled in FA26 gets a card until the end of FA26.
    expect(studentCardValidUntil('FA19', 'FA26')).toBe('2027-01-31');
  });

  it('is valid while the account is active and the end date has not passed', () => {
    expect(idCardStatus({ active: true, validUntil: '2027-07-15' }, '2026-10-13')).toBe('valid');
    expect(idCardStatus({ active: true, validUntil: '2027-07-15' }, '2027-07-15')).toBe('valid');
    expect(idCardStatus({ active: true, validUntil: '2027-07-15' }, '2027-07-16')).toBe('expired');
    expect(idCardStatus({ active: true, validUntil: null }, '2040-01-01')).toBe('valid');
    expect(idCardStatus({ active: false, validUntil: null }, '2026-10-13')).toBe('invalid');
  });

  it('only accepts well-formed card codes', () => {
    expect(ID_CARD_CODE_PATTERN.test('AbCdEfGhIjKlMnOpQrStUv-_')).toBe(true);
    expect(ID_CARD_CODE_PATTERN.test('short')).toBe(false);
    expect(ID_CARD_CODE_PATTERN.test('AbCdEfGhIjKlMnOpQrStUv/=')).toBe(false);
  });
});
