import type { TypingEvent } from '@cui/shared';
import { create } from 'zustand';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';

interface TypingEntry {
  name: string;
  until: number;
}

interface RealtimeState {
  status: ConnectionStatus;
  online: Set<string>;
  /** groupId → userId → who is typing (entries expire if a stop event is missed). */
  typing: Record<string, Record<string, TypingEntry>>;
  setStatus: (status: ConnectionStatus) => void;
  setOnline: (userIds: string[]) => void;
  setPresence: (userId: string, online: boolean) => void;
  setTyping: (event: TypingEvent) => void;
  pruneTyping: () => void;
  reset: () => void;
}

const TYPING_TTL_MS = 5000;

export const useRealtime = create<RealtimeState>((set, get) => ({
  status: 'connecting',
  online: new Set(),
  typing: {},
  setStatus: (status) => set({ status }),
  setOnline: (userIds) => set({ online: new Set(userIds) }),
  setPresence: (userId, isOnline) => {
    const online = new Set(get().online);
    if (isOnline) online.add(userId);
    else online.delete(userId);
    set({ online });
  },
  setTyping: ({ groupId, userId, name, typing }) => {
    const group = { ...(get().typing[groupId] ?? {}) };
    if (typing) group[userId] = { name, until: Date.now() + TYPING_TTL_MS };
    else delete group[userId];
    set({ typing: { ...get().typing, [groupId]: group } });
  },
  pruneTyping: () => {
    const now = Date.now();
    let changed = false;
    const next: RealtimeState['typing'] = {};
    for (const [groupId, users] of Object.entries(get().typing)) {
      const kept: Record<string, TypingEntry> = {};
      for (const [userId, entry] of Object.entries(users)) {
        if (entry.until > now) kept[userId] = entry;
        else changed = true;
      }
      next[groupId] = kept;
    }
    if (changed) set({ typing: next });
  },
  reset: () => set({ status: 'connecting', online: new Set(), typing: {} }),
}));

export function useTypingNames(groupId: string): string[] {
  const entries = useRealtime((s) => s.typing[groupId]);
  return entries ? Object.values(entries).map((e) => e.name) : [];
}
