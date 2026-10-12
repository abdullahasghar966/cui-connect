import { describe, expect, it } from 'vitest';
import { officeHourSlots } from './bookings';

describe('office-hour slots', () => {
  const hours = [
    { day: 1, start: '11:00', end: '12:00' },
    { day: 3, start: '14:00', end: '14:40' },
    { day: 1, start: '15:00', end: '15:30' },
  ];

  it("cuts each day's office hours into 15-minute slots", () => {
    // 2026-10-19 is a Monday.
    expect(officeHourSlots(hours, '2026-10-19')).toEqual([
      { start: '11:00', end: '11:15' },
      { start: '11:15', end: '11:30' },
      { start: '11:30', end: '11:45' },
      { start: '11:45', end: '12:00' },
      { start: '15:00', end: '15:15' },
      { start: '15:15', end: '15:30' },
    ]);
  });

  it('drops a last slot that would run past the end, and days without hours', () => {
    expect(officeHourSlots(hours, '2026-10-21')).toEqual([
      { start: '14:00', end: '14:15' },
      { start: '14:15', end: '14:30' },
    ]);
    expect(officeHourSlots(hours, '2026-10-20')).toEqual([]);
  });

  it('never lists the same slot twice when hours overlap', () => {
    const overlapping = [
      { day: 1, start: '11:00', end: '11:30' },
      { day: 1, start: '11:15', end: '11:45' },
    ];
    expect(officeHourSlots(overlapping, '2026-10-19').map((s) => s.start)).toEqual([
      '11:00',
      '11:15',
      '11:30',
    ]);
  });
});
