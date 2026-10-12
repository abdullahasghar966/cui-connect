import { describe, expect, it } from 'vitest';
import {
  canSubmit,
  checkRegistration,
  describeSlots,
  MAX_CREDITS,
  type OfferLike,
} from './registration';

const offer = (code: string, slots: OfferLike['slots'], extra: Partial<OfferLike> = {}) => ({
  id: `${code}-A`,
  code,
  title: code,
  sectionName: 'BCS-8A',
  credits: 3,
  prerequisites: [],
  slots,
  seatsLeft: 10,
  ...extra,
});
const record = { passed: ['CSC101', 'CSC462'], inProgress: ['CSC498'] };
const block = (r: ReturnType<typeof checkRegistration>) =>
  r.issues.filter((i) => i.level === 'block').map((i) => i.message);
const warn = (r: ReturnType<typeof checkRegistration>) =>
  r.issues.filter((i) => i.level === 'warn').map((i) => i.message);

describe('course registration checks', () => {
  const monday = [{ day: 1, start: '08:30', end: '10:00' }];
  const tuesday = [{ day: 2, start: '08:30', end: '10:00' }];

  it('accepts a sensible plan and adds up its credit hours', () => {
    const plan = [1, 2, 3, 4, 5].map((day) =>
      offer(`CSC40${day}`, [{ day, start: '10:00', end: '11:30' }]),
    );
    const result = checkRegistration(plan, record);
    expect(result.credits).toBe(15);
    expect(result.issues).toEqual([]);
    expect(canSubmit(result.issues)).toBe(true);
  });

  it('blocks passed courses and missing prerequisites; one in progress is only a warning', () => {
    const result = checkRegistration(
      [
        offer('CSC101', monday),
        offer('CSC460', tuesday, { prerequisites: ['CSC462'] }),
        offer('CSC499', [{ day: 3, start: '08:30', end: '10:00' }], { prerequisites: ['CSC498'] }),
        offer('CSC334', [{ day: 4, start: '08:30', end: '10:00' }], { prerequisites: ['CSC322'] }),
      ],
      record,
    );
    expect(block(result)).toEqual([
      'You have already passed CSC101.',
      'CSC334 needs CSC322 first.',
    ]);
    expect(warn(result)).toContain(
      "CSC499 needs CSC498, which you are taking this term. If you don't pass it, CSC499 will be dropped.",
    );
    expect(canSubmit(result.issues)).toBe(false);
  });

  it('blocks clashes, the same course twice and full sections (unless the seat is already yours)', () => {
    const clash = checkRegistration(
      [offer('CSC475', monday), offer('CSC460', [{ day: 1, start: '09:00', end: '11:00' }])],
      record,
    );
    expect(block(clash)).toEqual(['CSC475 and CSC460 meet at the same time (Mon 8:30 AM).']);

    const twice = checkRegistration(
      [offer('CSC475', monday), offer('CSC475', tuesday, { id: 'CSC475-B' })],
      record,
    );
    expect(block(twice)).toEqual(['CSC475 is in your plan twice. Keep one section.']);

    const full = [offer('CSC475', monday, { seatsLeft: 0 })];
    expect(block(checkRegistration(full, record))).toEqual([
      'CSC475 (BCS-8A) is full. Pick another section.',
    ]);
    expect(block(checkRegistration(full, record, ['CSC475-A']))).toEqual([]);
  });

  it(`stops at ${MAX_CREDITS} credit hours and warns below 12`, () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      offer(`CSC3${i}0`, [
        { day: (i % 5) + 1, start: i < 5 ? '08:30' : '14:00', end: i < 5 ? '10:00' : '15:30' },
      ]),
    );
    expect(block(checkRegistration(many, record))).toEqual([
      "That's 24 credit hours; the most you can take is 21.",
    ]);
    expect(warn(checkRegistration([offer('CSC475', monday)], record))).toEqual([
      '3 credit hours is below 12, so you would study part-time this term.',
    ]);
    expect(block(checkRegistration([], record))).toEqual(['Pick at least one course.']);
  });

  it('describes the weekly meetings', () => {
    expect(describeSlots([...tuesday, ...monday])).toBe(
      'Mon 8:30 AM–10:00 AM · Tue 8:30 AM–10:00 AM',
    );
    expect(describeSlots([])).toBe('Times to be announced');
  });
});
