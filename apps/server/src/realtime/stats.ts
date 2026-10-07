/** Sliding one-minute counters for the admin dashboard. */
const WINDOW_MS = 60_000;
const sent: number[] = [];
const denied: number[] = [];

function prune(list: number[], now: number): void {
  while (list.length && (list[0] ?? 0) < now - WINDOW_MS) list.shift();
}

export function recordMessageSent(): void {
  sent.push(Date.now());
}

export function recordDenied(): void {
  denied.push(Date.now());
}

export function rateSnapshot(): { messagesLastMinute: number; deniedLastMinute: number } {
  const now = Date.now();
  prune(sent, now);
  prune(denied, now);
  return { messagesLastMinute: sent.length, deniedLastMinute: denied.length };
}
