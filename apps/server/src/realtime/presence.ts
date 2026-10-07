/**
 * Online presence, counted per user across tabs/devices. Single-process by design; a
 * multi-instance deployment would keep these counters in Redis next to the Socket.IO adapter.
 */
const connections = new Map<string, number>();

/** Returns true when this is the user's first live connection (they just came online). */
export function markConnected(userId: string): boolean {
  const next = (connections.get(userId) ?? 0) + 1;
  connections.set(userId, next);
  return next === 1;
}

/** Returns true when the user's last connection closed (they just went offline). */
export function markDisconnected(userId: string): boolean {
  const next = (connections.get(userId) ?? 1) - 1;
  if (next <= 0) {
    connections.delete(userId);
    return true;
  }
  connections.set(userId, next);
  return false;
}

export function isOnline(userId: string): boolean {
  return connections.has(userId);
}

export function onlineUserIds(): string[] {
  return [...connections.keys()];
}

export function connectionCount(): number {
  let total = 0;
  for (const n of connections.values()) total += n;
  return total;
}

export function resetPresence(): void {
  connections.clear();
}
