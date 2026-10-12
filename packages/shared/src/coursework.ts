/**
 * Coursework rules shared by the server and the web app: which files may be uploaded, when an
 * assignment takes submissions (and when they count as late), and how a live quiz is ranked.
 */
import { campusClock, formatClock, formatShortDate } from './academics';

// ---- Files ----

/** Largest single upload (the free database tier holds 512 MB in all). */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** What one person may keep stored at a time. */
export const FILE_QUOTA_BYTES = 50 * 1024 * 1024;
export const MAX_FILES_PER_ITEM = 5;

/** Why a file was uploaded; it decides who may download it. */
export const FILE_PURPOSES = ['submission', 'material', 'assignment'] as const;
export type FilePurpose = (typeof FILE_PURPOSES)[number];

/**
 * Accepted files by extension, with the type they're served as. Only images are shown in the
 * browser; everything else downloads, so an uploaded page can never run on this site.
 */
export const FILE_TYPES: Record<string, { mime: string; inline?: true }> = {
  pdf: { mime: 'application/pdf' },
  doc: { mime: 'application/msword' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  ppt: { mime: 'application/vnd.ms-powerpoint' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  xls: { mime: 'application/vnd.ms-excel' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  odt: { mime: 'application/vnd.oasis.opendocument.text' },
  txt: { mime: 'text/plain' },
  md: { mime: 'text/markdown' },
  csv: { mime: 'text/csv' },
  zip: { mime: 'application/zip' },
  rar: { mime: 'application/vnd.rar' },
  '7z': { mime: 'application/x-7z-compressed' },
  png: { mime: 'image/png', inline: true },
  jpg: { mime: 'image/jpeg', inline: true },
  jpeg: { mime: 'image/jpeg', inline: true },
  gif: { mime: 'image/gif', inline: true },
  webp: { mime: 'image/webp', inline: true },
  // Source code (always downloaded, never run).
  c: { mime: 'text/plain' },
  cpp: { mime: 'text/plain' },
  h: { mime: 'text/plain' },
  java: { mime: 'text/plain' },
  py: { mime: 'text/plain' },
  ipynb: { mime: 'application/json' },
  js: { mime: 'text/plain' },
  ts: { mime: 'text/plain' },
  html: { mime: 'text/plain' },
  css: { mime: 'text/plain' },
  json: { mime: 'application/json' },
  sql: { mime: 'text/plain' },
};

/** The `accept` attribute for file pickers. */
export const FILE_ACCEPT = Object.keys(FILE_TYPES)
  .map((ext) => `.${ext}`)
  .join(',');

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** The served type of an accepted file, or null when the extension isn't accepted. */
export function fileTypeFor(name: string): { ext: string; mime: string; inline: boolean } | null {
  const ext = fileExtension(name);
  const type = FILE_TYPES[ext];
  return type ? { ext, mime: type.mime, inline: !!type.inline } : null;
}

/** A safe display name: no folders, no control characters, at most 120 characters. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point.
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '').trim();
  if (cleaned.length <= 120) return cleaned;
  const ext = fileExtension(cleaned);
  return `${cleaned.slice(0, 119 - ext.length)}.${ext}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/.0$/, '')} MB`;
}

// ---- Assignments ----

/** "Fri 23 Oct, 11:59 PM" in campus time. */
export function formatInstant(iso: string): string {
  const clock = campusClock(new Date(iso));
  const h = String(Math.floor(clock.minutes / 60)).padStart(2, '0');
  const m = String(clock.minutes % 60).padStart(2, '0');
  return `${formatShortDate(clock.date)}, ${formatClock(`${h}:${m}`)}`;
}

export type SubmissionWindow = 'open' | 'late' | 'closed';

/** Before the due time: open; then late until `lateUntil` (if late work is accepted); then closed. */
export function submissionWindow(
  assignment: { dueAt: string; lateUntil: string | null },
  now: Date = new Date(),
): SubmissionWindow {
  const t = now.getTime();
  if (t <= Date.parse(assignment.dueAt)) return 'open';
  if (assignment.lateUntil && t <= Date.parse(assignment.lateUntil)) return 'late';
  return 'closed';
}

export const isLate = (dueAt: string, submittedAt: string) =>
  Date.parse(submittedAt) > Date.parse(dueAt);

/** "due in 3 days", "due in 5 h", "due in 20 min", "2 days overdue". */
export function dueIn(dueAt: string, now: Date = new Date()): string {
  const minutes = Math.round((Date.parse(dueAt) - now.getTime()) / 60_000);
  const span = (m: number) => {
    if (m < 60) return `${Math.max(1, m)} min`;
    if (m < 48 * 60) return `${Math.round(m / 60)} h`;
    return `${Math.round(m / (24 * 60))} days`;
  };
  return minutes >= 0 ? `due in ${span(minutes)}` : `${span(-minutes)} overdue`;
}

// ---- Live quizzes ----

export const QUIZ_STATUSES = ['draft', 'live', 'ended'] as const;
export type QuizStatus = (typeof QUIZ_STATUSES)[number];

export const QUIZ_LIMITS = {
  questions: 30,
  minOptions: 2,
  maxOptions: 6,
  maxPoints: 10,
  minSeconds: 10,
  maxSeconds: 300,
} as const;

/** Answers that arrive this long after the countdown (network lag) still count. */
export const QUIZ_ANSWER_GRACE_MS = 1500;

export interface QuizScore {
  studentId: string;
  score: number;
  /** Total time taken to answer, in milliseconds (breaks ties: faster first). */
  ms: number;
}

/** Highest score first, then fastest; equal score and time share a rank (1, 2, 2, 4). */
export function rankQuiz<T extends QuizScore>(scores: T[]): (T & { rank: number })[] {
  const sorted = [...scores].sort((a, b) => b.score - a.score || a.ms - b.ms);
  let rank = 0;
  return sorted.map((s, i) => {
    const prev = sorted[i - 1];
    if (!prev || prev.score !== s.score || prev.ms !== s.ms) rank = i + 1;
    return { ...s, rank };
  });
}
