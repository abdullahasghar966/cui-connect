import type {
  AddMemberInput,
  AdminGroupDTO,
  AdminOverviewDTO,
  ApiErrorBody,
  AssessmentDTO,
  AssessmentInput,
  AttendanceQrDTO,
  AttendanceSessionDetailDTO,
  AttendanceSheetDTO,
  AttendanceStatus,
  AuditDTO,
  CampusSettingsDTO,
  CampusSettingsInput,
  CatalogCourseDTO,
  CatalogCourseInput,
  ChangePasswordInput,
  CheckInResultDTO,
  ClassChangeInput,
  ClassSlotDTO,
  ClassSlotInput,
  CourseDetailDTO,
  CourseDTO,
  CourseGradingInput,
  CreateCourseInput,
  CreateDepartmentInput,
  CreateGroupInput,
  CreateSectionInput,
  CreateTermInput,
  CreateUserInput,
  CsvImportResultDTO,
  DepartmentDTO,
  DepartmentRefDTO,
  ExamCheckDTO,
  ExamDTO,
  ExamInput,
  ExamKind,
  ExamOptionsDTO,
  FirstAdminInput,
  GradingWeights,
  GroupDTO,
  GroupType,
  LoginInput,
  MarkNotificationsInput,
  MarksInput,
  MarksSheetDTO,
  MemberDTO,
  MemberRole,
  MessagesPage,
  MyAttendanceCourseDTO,
  MyExamDTO,
  MyResultsDTO,
  NotificationsPage,
  ProgramDTO,
  ProgramInput,
  PublicUserDTO,
  Role,
  RoomDTO,
  RoomInput,
  SeatingChartDTO,
  SectionDTO,
  SectionRefDTO,
  SlotCheckDTO,
  StartAttendanceInput,
  TeachingCourseDTO,
  TermDTO,
  TimetableView,
  TimetableWeekDTO,
  TodayDTO,
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
    catalog: (params: { q?: string; departmentId?: string; offered?: '1' } = {}) =>
      request<CatalogCourseDTO[]>(`/api/academics/catalog${query(params)}`),
    course: (code: string) =>
      request<CatalogCourseDTO>(`/api/academics/catalog/${encodeURIComponent(code)}`),
    courseDetail: (code: string) =>
      request<CourseDetailDTO>(`/api/academics/courses/${encodeURIComponent(code)}`),
    departments: () => request<DepartmentRefDTO[]>('/api/academics/departments'),
    saveCourse: (code: string, input: CatalogCourseInput) =>
      send<CatalogCourseDTO>(`/api/academics/catalog/${encodeURIComponent(code)}`, 'PUT', input),
    deleteCourse: (code: string) =>
      send<{ ok: true }>(`/api/academics/catalog/${encodeURIComponent(code)}`, 'DELETE'),
    importCatalog: (csv: string) =>
      send<CsvImportResultDTO>('/api/academics/catalog/import', 'POST', { csv }),
    sections: () => request<SectionRefDTO[]>('/api/academics/sections'),
    offerings: (sectionId?: string) =>
      request<CourseDTO[]>(`/api/academics/offerings${query({ sectionId })}`),
    teachers: () => request<PublicUserDTO[]>('/api/academics/teachers'),
    timetable: (params: { view?: TimetableView; id?: string; week?: string }) =>
      request<TimetableWeekDTO>(`/api/academics/timetable${query(params)}`),
    today: () => request<TodayDTO>('/api/academics/timetable/today'),
    sectionSlots: (sectionId: string) =>
      request<ClassSlotDTO[]>(`/api/academics/timetable/sections/${sectionId}/slots`),
    checkSlot: (input: ClassSlotInput, slotId?: string) =>
      send<SlotCheckDTO>('/api/academics/timetable/check', 'POST', { ...input, slotId }),
    saveSlot: (input: ClassSlotInput, slotId?: string) =>
      slotId
        ? send<{ slot: ClassSlotDTO; warnings: string[] }>(
            `/api/academics/timetable/slots/${slotId}`,
            'PUT',
            input,
          )
        : send<{ slot: ClassSlotDTO; warnings: string[] }>(
            '/api/academics/timetable/slots',
            'POST',
            input,
          ),
    deleteSlot: (slotId: string) =>
      send<{ ok: true }>(`/api/academics/timetable/slots/${slotId}`, 'DELETE'),
    changeClass: (slotId: string, input: ClassChangeInput) =>
      send<{ ok: true }>(`/api/academics/timetable/slots/${slotId}/changes`, 'POST', input),
    restoreClass: (slotId: string, date: string) =>
      send<{ ok: true }>(`/api/academics/timetable/slots/${slotId}/changes/${date}`, 'DELETE'),
    settings: () => request<CampusSettingsDTO>('/api/academics/settings'),
    myAttendance: () => request<MyAttendanceCourseDTO[]>('/api/academics/attendance'),
    results: () => request<MyResultsDTO>('/api/academics/results'),
    checkIn: (sessionId: string, token: string) =>
      send<CheckInResultDTO>('/api/academics/attendance/check-in', 'POST', { sessionId, token }),
    programs: () => request<ProgramDTO[]>('/api/academics/programs'),
    saveProgram: (code: string, input: ProgramInput) =>
      send<ProgramDTO>(`/api/academics/programs/${encodeURIComponent(code)}`, 'PUT', input),
    deleteProgram: (code: string) =>
      send<{ ok: true }>(`/api/academics/programs/${encodeURIComponent(code)}`, 'DELETE'),
  },

  teaching: {
    courses: () => request<TeachingCourseDTO[]>('/api/teaching/courses'),
    attendanceSheet: (offeringId: string) =>
      request<AttendanceSheetDTO>(`/api/teaching/courses/${offeringId}/attendance`),
    startAttendance: (input: StartAttendanceInput) =>
      send<AttendanceSessionDetailDTO>('/api/teaching/attendance', 'POST', input),
    session: (sessionId: string) =>
      request<AttendanceSessionDetailDTO>(`/api/teaching/attendance/${sessionId}`),
    qr: (sessionId: string) => request<AttendanceQrDTO>(`/api/teaching/attendance/${sessionId}/qr`),
    mark: (sessionId: string, studentId: string, status: AttendanceStatus | null) =>
      send<AttendanceSessionDetailDTO['roster'][number]>(
        `/api/teaching/attendance/${sessionId}/students/${studentId}`,
        'PUT',
        { status },
      ),
    marks: (offeringId: string) =>
      request<MarksSheetDTO>(`/api/teaching/courses/${offeringId}/marks`),
    addAssessment: (offeringId: string, input: AssessmentInput) =>
      send<AssessmentDTO>(`/api/teaching/courses/${offeringId}/assessments`, 'POST', input),
    updateAssessment: (assessmentId: string, input: AssessmentInput) =>
      send<{ ok: true }>(`/api/teaching/assessments/${assessmentId}`, 'PUT', input),
    deleteAssessment: (assessmentId: string) =>
      send<{ ok: true }>(`/api/teaching/assessments/${assessmentId}`, 'DELETE'),
    saveMarks: (assessmentId: string, input: MarksInput) =>
      send<{ saved: number }>(`/api/teaching/assessments/${assessmentId}/marks`, 'PUT', input),
    publish: (assessmentId: string, publish: boolean) =>
      send<{ ok: true }>(
        `/api/teaching/assessments/${assessmentId}/${publish ? 'publish' : 'unpublish'}`,
        'POST',
      ),
    setGrading: (offeringId: string, input: CourseGradingInput) =>
      send<GradingWeights>(`/api/teaching/courses/${offeringId}/grading`, 'PUT', input),
    finalize: (offeringId: string) =>
      send<{ finalized: number }>(`/api/teaching/courses/${offeringId}/finalize`, 'POST'),
    closeSession: (sessionId: string) =>
      send<AttendanceSessionDetailDTO>(`/api/teaching/attendance/${sessionId}/close`, 'POST'),
  },

  exams: {
    list: (kind?: ExamKind) => request<ExamDTO[]>(`/api/exams${query({ kind })}`),
    mine: () => request<MyExamDTO[]>('/api/exams/mine'),
    options: () => request<ExamOptionsDTO>('/api/exams/options'),
    check: (input: ExamInput, examId?: string) =>
      send<ExamCheckDTO>('/api/exams/check', 'POST', { ...input, examId }),
    save: (input: ExamInput, examId?: string) =>
      examId
        ? send<{ exam: ExamDTO; warnings: string[] }>(`/api/exams/${examId}`, 'PUT', input)
        : send<{ exam: ExamDTO; warnings: string[] }>('/api/exams', 'POST', input),
    remove: (examId: string) => send<{ ok: true }>(`/api/exams/${examId}`, 'DELETE'),
    publish: (kind: ExamKind) =>
      send<{ published: number }>('/api/exams/publish', 'POST', { kind }),
    assignSeats: (examId: string) =>
      send<{ seated: number; unseated: number }>(`/api/exams/${examId}/seats`, 'POST'),
    seating: (examId: string) => request<SeatingChartDTO>(`/api/exams/${examId}/seating`),
  },

  admin: {
    overview: () => request<AdminOverviewDTO>('/api/admin/overview'),
    updateSettings: (input: CampusSettingsInput) =>
      send<CampusSettingsDTO>('/api/admin/settings', 'PUT', input),
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
