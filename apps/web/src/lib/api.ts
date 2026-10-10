import type {
  AddMemberInput,
  AdminGroupDTO,
  AdminOverviewDTO,
  ApiErrorBody,
  AuditDTO,
  CatalogCourseDTO,
  CatalogCourseInput,
  ChangePasswordInput,
  CourseDTO,
  CreateCourseInput,
  CreateDepartmentInput,
  CreateGroupInput,
  CreateSectionInput,
  CreateTermInput,
  CreateUserInput,
  CsvImportResultDTO,
  DepartmentDTO,
  FirstAdminInput,
  GroupDTO,
  GroupType,
  LoginInput,
  MarkNotificationsInput,
  MemberDTO,
  MemberRole,
  MessagesPage,
  NotificationsPage,
  ProgramDTO,
  ProgramInput,
  PublicUserDTO,
  Role,
  RoomDTO,
  RoomInput,
  SectionDTO,
  TermDTO,
  UpdateGroupInput,
  UpdateUserInput,
  UserDTO,
} from '@cui/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: 'same-origin',
      ...init,
      headers: { 'content-type': 'application/json', ...init.headers },
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection.');
  }
  if (!res.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      // non-JSON error
    }
    throw new ApiError(
      res.status,
      body?.error.code ?? 'INTERNAL',
      body?.error.message ?? `Request failed (${res.status})`,
      body?.error.details,
    );
  }
  return (await res.json()) as T;
}

const send = <T>(path: string, method: string, body?: unknown) =>
  request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

const query = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

export interface DemoAccount {
  label: string;
  identifier: string;
  role: Role;
  note: string;
}

export const api = {
  login: (input: LoginInput) => send<{ user: UserDTO }>('/api/auth/login', 'POST', input),
  logout: () => send<{ ok: true }>('/api/auth/logout', 'POST'),
  me: () => request<{ user: UserDTO }>('/api/auth/me'),
  demoAccounts: () =>
    request<{ password: string; accounts: DemoAccount[] }>('/api/auth/demo-accounts'),
  setupStatus: () => request<{ needed: boolean; codeRequired: boolean }>('/api/auth/setup'),
  setup: (input: FirstAdminInput) => send<{ user: UserDTO }>('/api/auth/setup', 'POST', input),
  changePassword: (input: ChangePasswordInput) =>
    send<{ ok: true }>('/api/auth/password', 'POST', input),

  groups: () => request<GroupDTO[]>('/api/groups'),
  discover: () => request<AdminGroupDTO[]>('/api/groups/discover'),
  updateGroup: (groupId: string, input: UpdateGroupInput) =>
    send<{ ok: true }>(`/api/groups/${groupId}`, 'PATCH', input),
  members: (groupId: string) => request<MemberDTO[]>(`/api/groups/${groupId}/members`),
  addMember: (groupId: string, input: AddMemberInput) =>
    send<MemberDTO>(`/api/groups/${groupId}/members`, 'POST', input),
  setMemberRole: (groupId: string, userId: string, role: MemberRole) =>
    send<{ ok: true }>(`/api/groups/${groupId}/members/${userId}`, 'PATCH', { role }),
  removeMember: (groupId: string, userId: string) =>
    send<{ ok: true }>(`/api/groups/${groupId}/members/${userId}`, 'DELETE'),
  messages: (groupId: string, params: { before?: string; after?: string; limit?: number }) =>
    request<MessagesPage>(`/api/groups/${groupId}/messages${query(params)}`),
  directory: (q: string) => request<PublicUserDTO[]>(`/api/directory${query({ q })}`),

  notifications: (before?: string) =>
    request<NotificationsPage>(`/api/notifications${query({ before, limit: 30 })}`),
  markNotifications: (input: MarkNotificationsInput) =>
    send<{ unread: number }>('/api/notifications/read', 'POST', input),

  academics: {
    terms: () => request<TermDTO[]>('/api/academics/terms'),
    rooms: () => request<RoomDTO[]>('/api/academics/rooms'),
    catalog: (params: { q?: string; departmentId?: string } = {}) =>
      request<CatalogCourseDTO[]>(`/api/academics/catalog${query(params)}`),
    course: (code: string) =>
      request<CatalogCourseDTO>(`/api/academics/catalog/${encodeURIComponent(code)}`),
    saveCourse: (code: string, input: CatalogCourseInput) =>
      send<CatalogCourseDTO>(`/api/academics/catalog/${encodeURIComponent(code)}`, 'PUT', input),
    deleteCourse: (code: string) =>
      send<{ ok: true }>(`/api/academics/catalog/${encodeURIComponent(code)}`, 'DELETE'),
    importCatalog: (csv: string) =>
      send<CsvImportResultDTO>('/api/academics/catalog/import', 'POST', { csv }),
    programs: () => request<ProgramDTO[]>('/api/academics/programs'),
    saveProgram: (code: string, input: ProgramInput) =>
      send<ProgramDTO>(`/api/academics/programs/${encodeURIComponent(code)}`, 'PUT', input),
    deleteProgram: (code: string) =>
      send<{ ok: true }>(`/api/academics/programs/${encodeURIComponent(code)}`, 'DELETE'),
  },

  admin: {
    overview: () => request<AdminOverviewDTO>('/api/admin/overview'),
    createTerm: (input: CreateTermInput) => send<TermDTO>('/api/admin/terms', 'POST', input),
    setCurrentTerm: (termId: string) => send<TermDTO>(`/api/admin/terms/${termId}/current`, 'POST'),
    createRoom: (input: RoomInput) => send<RoomDTO>('/api/admin/rooms', 'POST', input),
    updateRoom: (roomId: string, input: RoomInput) =>
      send<RoomDTO>(`/api/admin/rooms/${roomId}`, 'PUT', input),
    deleteRoom: (roomId: string) => send<{ ok: true }>(`/api/admin/rooms/${roomId}`, 'DELETE'),
    departments: () => request<DepartmentDTO[]>('/api/admin/departments'),
    createDepartment: (input: CreateDepartmentInput) =>
      send<{ id: string }>('/api/admin/departments', 'POST', input),
    sections: () => request<SectionDTO[]>('/api/admin/sections'),
    createSection: (input: CreateSectionInput) =>
      send<{ id: string }>('/api/admin/sections', 'POST', input),
    setAdvisor: (sectionId: string, batchAdvisorId: string | null) =>
      send<{ ok: true }>(`/api/admin/sections/${sectionId}`, 'PATCH', { batchAdvisorId }),
    courses: () => request<CourseDTO[]>('/api/admin/courses'),
    createCourse: (input: CreateCourseInput) =>
      send<{ id: string }>('/api/admin/courses', 'POST', input),
    courseStudents: (courseId: string) =>
      request<PublicUserDTO[]>(`/api/admin/courses/${courseId}/students`),
    enroll: (courseId: string, studentIds: string[]) =>
      send<{ ok: true }>(`/api/admin/courses/${courseId}/enroll`, 'POST', { studentIds }),
    unenroll: (courseId: string, studentId: string) =>
      send<{ ok: true }>(`/api/admin/courses/${courseId}/students/${studentId}`, 'DELETE'),
    users: (params: { q?: string; role?: Role }) =>
      request<UserDTO[]>(`/api/admin/users${query(params)}`),
    createUser: (input: CreateUserInput) => send<UserDTO>('/api/admin/users', 'POST', input),
    updateUser: (userId: string, input: UpdateUserInput) =>
      send<UserDTO>(`/api/admin/users/${userId}`, 'PATCH', input),
    importUsers: (csv: string, defaultPassword?: string) =>
      send<CsvImportResultDTO>('/api/admin/users/import', 'POST', { csv, defaultPassword }),
    groups: (type?: GroupType) => request<AdminGroupDTO[]>(`/api/admin/groups${query({ type })}`),
    createGroup: (input: CreateGroupInput) =>
      send<{ id: string; failures: string[] }>('/api/admin/groups', 'POST', input),
    audit: (limit = 100) => request<AuditDTO[]>(`/api/admin/audit${query({ limit })}`),
  },
};
