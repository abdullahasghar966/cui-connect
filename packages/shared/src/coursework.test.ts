import { describe, expect, it } from 'vitest';
import { campusInstant } from './academics';
import {
  cleanFileName,
  dueIn,
  fileTypeFor,
  formatBytes,
  formatInstant,
  isLate,
  rankQuiz,
  submissionWindow,
} from './coursework';

describe('files', () => {
  it('accepts documents, code and images by extension, and shows only images inline', () => {
    expect(fileTypeFor('Report.PDF')).toEqual({
      ext: 'pdf',
      mime: 'application/pdf',
      inline: false,
    });
    expect(fileTypeFor('photo.jpeg')?.inline).toBe(true);
    expect(fileTypeFor('index.html')).toMatchObject({ mime: 'text/plain', inline: false });
    expect(fileTypeFor('virus.exe')).toBeNull();
    expect(fileTypeFor('no-extension')).toBeNull();
    expect(fileTypeFor('.pdf')).toBeNull();
  });

  it('cleans file names', () => {
    expect(cleanFileName('C:\\Users\\me\\Desktop\\a1.zip')).toBe('a1.zip');
    expect(cleanFileName('../../etc/passwd')).toBe('passwd');
    expect(cleanFileName('bad"name<>|.txt')).toBe('badname.txt');
    const long = `${'x'.repeat(200)}.docx`;
    expect(cleanFileName(long)).toHaveLength(120);
    expect(cleanFileName(long).endsWith('.docx')).toBe(true);
  });

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
  });
});

describe('assignment windows', () => {
  const dueAt = campusInstant('2026-10-23', '23:59').toISOString();
  const lateUntil = campusInstant('2026-10-25', '23:59').toISOString();

  it('is open until the due time, then late while late work is accepted, then closed', () => {
    const at = (date: string, time: string) => campusInstant(date, time);
    expect(submissionWindow({ dueAt, lateUntil: null }, at('2026-10-23', '23:00'))).toBe('open');
    expect(submissionWindow({ dueAt, lateUntil: null }, at('2026-10-24', '00:30'))).toBe('closed');
    expect(submissionWindow({ dueAt, lateUntil }, at('2026-10-24', '00:30'))).toBe('late');
    expect(submissionWindow({ dueAt, lateUntil }, at('2026-10-26', '00:30'))).toBe('closed');
  });

  it('flags late submissions and describes the time left', () => {
    expect(isLate(dueAt, campusInstant('2026-10-23', '23:58').toISOString())).toBe(false);
    expect(isLate(dueAt, campusInstant('2026-10-24', '00:01').toISOString())).toBe(true);
    const now = campusInstant('2026-10-23', '20:59');
    expect(dueIn(dueAt, now)).toBe('due in 3 h');
    expect(dueIn(dueAt, campusInstant('2026-10-20', '23:59'))).toBe('due in 3 days');
    expect(dueIn(dueAt, campusInstant('2026-10-23', '23:49'))).toBe('due in 10 min');
    expect(dueIn(dueAt, campusInstant('2026-10-26', '23:59'))).toBe('3 days overdue');
    expect(formatInstant(dueAt)).toBe('Fri 23 Oct, 11:59 PM');
  });
});

describe('quiz ranking', () => {
  it('ranks by score, then speed, sharing ranks on exact ties', () => {
    const ranked = rankQuiz([
      { studentId: 'a', score: 3, ms: 9000 },
      { studentId: 'b', score: 5, ms: 12000 },
      { studentId: 'c', score: 3, ms: 4000 },
      { studentId: 'd', score: 3, ms: 4000 },
      { studentId: 'e', score: 0, ms: 0 },
    ]);
    expect(ranked.map((r) => [r.studentId, r.rank])).toEqual([
      ['b', 1],
      ['c', 2],
      ['d', 2],
      ['a', 4],
      ['e', 5],
    ]);
  });
});
