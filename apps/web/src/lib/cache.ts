/** React Query cache updates driven by Socket.IO events and optimistic sends. */
import { ANONYMOUS_ID, type GroupDTO, type MessageDTO, type MessagesPage } from '@cui/shared';
import type { InfiniteData, QueryClient } from '@tanstack/react-query';

export type ClientMessage = MessageDTO & { status?: 'sending' | 'failed'; error?: string };
export type MessagesData = InfiniteData<
  MessagesPage & { messages: ClientMessage[] },
  string | undefined
>;

export const keys = {
  me: ['me'] as const,
  idCard: ['id-card'] as const,
  groups: ['groups'] as const,
  messages: (groupId: string) => ['messages', groupId] as const,
  members: (groupId: string) => ['members', groupId] as const,
  pins: (groupId: string) => ['pins', groupId] as const,
  directory: (q: string) => ['directory', q] as const,
  discover: ['discover'] as const,
  notifications: ['notifications'] as const,
  terms: ['academics', 'terms'] as const,
  rooms: ['academics', 'rooms'] as const,
  catalog: (q: string, departmentId = '', offered = false) =>
    ['academics', 'catalog', q, departmentId, offered] as const,
  course: (code: string) => ['academics', 'course', code] as const,
  courseDetail: (code: string) => ['academics', 'courses', code] as const,
  departments: ['academics', 'departments'] as const,
  programs: ['academics', 'programs'] as const,
  sections: ['academics', 'sections'] as const,
  teachers: ['academics', 'teachers'] as const,
  bookings: ['academics', 'bookings'] as const,
  slots: (teacherId: string) => ['academics', 'slots', teacherId] as const,
  timetable: ['academics', 'timetable'] as const,
  today: ['academics', 'timetable', 'today'] as const,
  settings: ['academics', 'settings'] as const,
  myAttendance: ['academics', 'attendance'] as const,
  results: ['academics', 'results'] as const,
  exams: ['exams'] as const,
  myExams: ['exams', 'mine'] as const,
  marksSheet: (offeringId: string) => ['teaching', 'marks', offeringId] as const,
  teachingCourses: ['teaching', 'courses'] as const,
  attendanceSheet: (offeringId: string) => ['teaching', 'sheet', offeringId] as const,
  attendanceSession: (sessionId: string) => ['teaching', 'session', sessionId] as const,
  coursework: ['coursework'] as const,
  services: ['services'] as const,
  requests: (box: 'mine' | 'inbox') => ['services', 'requests', box] as const,
  request: (id: string) => ['services', 'request', id] as const,
  campusEvents: ['campus', 'events'] as const,
  campusEvent: (id: string) => ['campus', 'events', id] as const,
  campusPlaces: ['campus', 'places'] as const,
  jobs: ['campus', 'jobs'] as const,
  lostFound: ['campus', 'lost-found'] as const,
  transport: ['campus', 'transport'] as const,
  lostItem: (id: string) => ['campus', 'lost-found', id] as const,
  evaluation: ['academics', 'evaluation'] as const,
  evaluationReport: (offeringId: string) =>
    ['academics', 'evaluation', 'report', offeringId] as const,
  registration: ['academics', 'registration'] as const,
  registrationHome: ['academics', 'registration', 'home'] as const,
  registrationApprovals: ['academics', 'registration', 'approvals'] as const,
  registrationDetail: (id: string) => ['academics', 'registration', 'detail', id] as const,
  fees: ['services', 'fees'] as const,
  myFees: ['services', 'fees', 'mine'] as const,
  feeDesk: (filters: Record<string, string>) => ['services', 'fees', 'desk', filters] as const,
  courseworkCourse: (offeringId: string) => ['coursework', 'course', offeringId] as const,
  assignment: (id: string) => ['coursework', 'assignment', id] as const,
  quiz: (id: string) => ['coursework', 'quiz', id] as const,
};

export function sortGroups(groups: GroupDTO[]): GroupDTO[] {
  return [...groups].sort(
    (a, b) =>
      (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '') || a.name.localeCompare(b.name),
  );
}

/** Inserts a message, or replaces it (matched by id, or by clientId for an optimistic copy). */
export function upsertMessage(qc: QueryClient, message: ClientMessage): void {
  qc.setQueryData<MessagesData>(keys.messages(message.groupId), (data) => {
    if (!data) return data;
    let replaced = false;
    const pages = data.pages.map((page) => ({
      ...page,
      messages: page.messages.map((m) => {
        const sameOptimistic = !!message.clientId && m.clientId === message.clientId;
        if (m.id === message.id || sameOptimistic) {
          replaced = true;
          // My anonymous question: the room's copy hides my name, but I keep seeing it's mine.
          const keepMine = message.sender.id === ANONYMOUS_ID && m.sender.id !== ANONYMOUS_ID;
          return keepMine ? { ...message, sender: m.sender } : message;
        }
        return m;
      }),
    }));
    if (replaced) return { ...data, pages };
    const [newest, ...older] = pages;
    if (!newest)
      return { pages: [{ messages: [message], hasMore: false }], pageParams: [undefined] };
    return { ...data, pages: [{ ...newest, messages: [...newest.messages, message] }, ...older] };
  });
}

export function patchMessage(
  qc: QueryClient,
  groupId: string,
  match: (m: ClientMessage) => boolean,
  patch: Partial<ClientMessage>,
): void {
  qc.setQueryData<MessagesData>(keys.messages(groupId), (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            messages: page.messages.map((m) => (match(m) ? { ...m, ...patch } : m)),
          })),
        }
      : data,
  );
}

export function removeMessage(
  qc: QueryClient,
  groupId: string,
  match: (m: ClientMessage) => boolean,
) {
  qc.setQueryData<MessagesData>(keys.messages(groupId), (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            messages: page.messages.filter((m) => !match(m)),
          })),
        }
      : data,
  );
}

export function patchGroup(
  qc: QueryClient,
  groupId: string,
  patch: Partial<GroupDTO> | ((g: GroupDTO) => Partial<GroupDTO>),
): void {
  qc.setQueryData<GroupDTO[]>(keys.groups, (groups) =>
    groups
      ? sortGroups(
          groups.map((g) =>
            g.id === groupId ? { ...g, ...(typeof patch === 'function' ? patch(g) : patch) } : g,
          ),
        )
      : groups,
  );
}

export function upsertGroup(qc: QueryClient, group: GroupDTO): void {
  qc.setQueryData<GroupDTO[]>(keys.groups, (groups) => {
    if (!groups) return [group];
    const exists = groups.some((g) => g.id === group.id);
    return sortGroups(
      exists ? groups.map((g) => (g.id === group.id ? group : g)) : [...groups, group],
    );
  });
}

export function removeGroup(qc: QueryClient, groupId: string): void {
  qc.setQueryData<GroupDTO[]>(keys.groups, (groups) => groups?.filter((g) => g.id !== groupId));
  qc.removeQueries({ queryKey: keys.messages(groupId) });
  qc.removeQueries({ queryKey: keys.members(groupId) });
}

export function findMessage(
  qc: QueryClient,
  groupId: string,
  match: (m: ClientMessage) => boolean,
): ClientMessage | undefined {
  const data = qc.getQueryData<MessagesData>(keys.messages(groupId));
  for (const page of data?.pages ?? []) {
    const found = page.messages.find(match);
    if (found) return found;
  }
  return undefined;
}

export function findGroup(qc: QueryClient, groupId: string): GroupDTO | undefined {
  return qc.getQueryData<GroupDTO[]>(keys.groups)?.find((g) => g.id === groupId);
}
