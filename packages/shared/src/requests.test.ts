import { describe, expect, it } from 'vitest';
import { leaveDays, nextStatuses, requestStatusLabel } from './requests';

describe('requests', () => {
  it('lets a leave only be approved or turned down, and other requests go through "in progress"', () => {
    expect(nextStatuses('leave', 'submitted')).toEqual(['approved', 'rejected']);
    expect(nextStatuses('transcript', 'submitted')).toEqual(['in_review', 'completed', 'rejected']);
    expect(nextStatuses('transcript', 'in_review')).toEqual(['completed', 'rejected']);
    for (const done of ['approved', 'rejected', 'completed', 'withdrawn'] as const) {
      expect(nextStatuses('complaint', done)).toEqual([]);
    }
  });

  it('describes each status in the words of its kind', () => {
    expect(requestStatusLabel('complaint', 'completed')).toBe('Resolved');
    expect(requestStatusLabel('bonafide', 'completed')).toBe('Ready to collect');
    expect(requestStatusLabel('leave', 'rejected')).toBe('Not approved');
    expect(requestStatusLabel('complaint', 'in_review')).toBe('Being looked into');
  });

  it('counts leave days with both ends included', () => {
    expect(leaveDays('2026-10-14', '2026-10-14')).toBe(1);
    expect(leaveDays('2026-10-14', '2026-10-16')).toBe(3);
    expect(leaveDays('2026-10-30', '2026-11-02')).toBe(4);
  });
});
