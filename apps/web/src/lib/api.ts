import type {
  AddMemberInput,
  AdminGroupDTO,
  AdminOverviewDTO,
  ApiErrorBody,
  AssessmentDTO,
  AssessmentInput,
  AssignmentDetailDTO,
  AssignmentDTO,
  AssignmentGradesInput,
  AssignmentInput,
  AttendanceQrDTO,
  AttendanceSessionDetailDTO,
  AttendanceSheetDTO,
  AttendanceStatus,
  AuditDTO,
  BookingDTO,
  BookingInput,
  CalendarEventDTO,
  CalendarEventInput,
  CalendarItemDTO,
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
  CourseworkCourseDTO,
  CourseworkOverviewDTO,
  CreateCourseInput,
  CreateDepartmentInput,
  CreateGroupInput,
  CreateSectionInput,
  CreateTermInput,
  CreateUserInput,
  CsvImportResultDTO,
  DegreeProgressDTO,
  DepartmentDTO,
  DepartmentRefDTO,
  ExamCheckDTO,
  ExamDTO,
  ExamInput,
  ExamKind,
  ExamOptionsDTO,
  FileDTO,
  FilePurpose,
  FirstAdminInput,
  GradingWeights,
  GroupDTO,
  GroupType,
  LoginInput,
  MarkNotificationsInput,
  MarksInput,
  MarksSheetDTO,
  MaterialDTO,
  MaterialInput,
  MemberDTO,
  MemberRole,
  MessageDTO,
  MessageHitDTO,
  MessagesPage,
  MyAttendanceCourseDTO,
  MyExamDTO,
  MyResultsDTO,
  NewRequestInput,
  NotificationsPage,
  OfficeInput,
  ProgramDTO,
  ProgramInput,
  PublicUserDTO,
  PushSubscriptionInput,
  QuizInput,
  QuizViewDTO,
  RequestStatusInput,
  Role,
  RoomDTO,
  RoomFinderDTO,
  RoomInput,
  SearchResultsDTO,
  SeatingChartDTO,
  SectionDTO,
  SectionRefDTO,
  ServiceRequestDTO,
  SlotCheckDTO,
  StartAttendanceInput,
  StudentRecordRefDTO,
  SubmissionDTO,
  SubmissionInput,
  TeacherDTO,
  TeacherSlotsDTO,
  TeachingCourseDTO,
  TermDTO,
  TimetableView,
  TimetableWeekDTO,
  TodayDTO,
  TranscriptDTO,
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

/** Sends a file's raw bytes; the server checks its type, size and who may upload it. */
const uploadFile = (file: File, purpose: FilePurpose, offeringId: string) =>
  request<FileDTO>(`/api/files${query({ purpose, offeringId })}`, {
    method: 'POST',
    body: file,
    headers: {
      'content-type': 'application/octet-stream',
      'x-file-name': encodeURIComponent(file.name),
    },
  });

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
  pins: (groupId: string) => request<MessageDTO[]>(`/api/groups/${groupId}/pins`),
  addMember: (groupId: string, input: AddMemberInput) =>
    send<MemberDTO>(`/api/groups/${groupId}/members`, 'POST', input),
  setMemberRole: (groupId: string, userId: string, role: MemberRole) =>
    send<{ ok: true }>(`/api/groups/${groupId}/members/${userId}`, 'PATCH', { role }),
  removeMember: (groupId: string, userId: string) =>
    send<{ ok: true }>(`/api/groups/${groupId}/members/${userId}`, 'DELETE'),
  messages: (groupId: string, params: { before?: string; after?: string; limit?: number }) =>
    request<MessagesPage>(`/api/groups/${groupId}/messages${query(params)}`),
  directory: (q: string) => request<PublicUserDTO[]>(`/api/directory${query({ q })}`),
  search: (q: string) => request<SearchResultsDTO>(`/api/search${query({ q })}`),
  searchMessages: (q: string) => request<MessageHitDTO[]>(`/api/search/messages${query({ q })}`),

  notifications: (before?: string) =>
    request<NotificationsPage>(`/api/notifications${query({ before, limit: 30 })}`),
  markNotifications: (input: MarkNotificationsInput) =>
    send<{ unread: number }>('/api/notifications/read', 'POST', input),

  academics: {
    terms: () => request<TermDTO[]>('/api/academics/terms'),
    rooms: () => request<RoomDTO[]>('/api/academics/rooms'),
    roomFinder: (params: { date?: string; time?: string }) =>
      request<RoomFinderDTO>(`/api/academics/rooms/finder${query(params)}`),
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
    teacherDirectory: (params: { q?: string; departmentId?: string } = {}) =>
      request<TeacherDTO[]>(`/api/academics/teachers/directory${query(params)}`),
    updateOffice: (input: OfficeInput) =>
      send<TeacherDTO>('/api/academics/me/office', 'PUT', input),
    teacherSlots: (teacherId: string) =>
      request<TeacherSlotsDTO>(`/api/academics/teachers/${teacherId}/slots`),
    bookings: () => request<BookingDTO[]>('/api/academics/bookings'),
    book: (input: BookingInput) => send<BookingDTO>('/api/academics/bookings', 'POST', input),
    cancelBooking: (bookingId: string, reason: string | null) =>
      send<BookingDTO>(`/api/academics/bookings/${bookingId}/cancel`, 'POST', { reason }),
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
    calendar: (from: string, to: string) =>
      request<CalendarEventDTO[]>(`/api/academics/calendar${query({ from, to })}`),
    myCalendar: (from: string, to: string) =>
      request<CalendarItemDTO[]>(`/api/academics/calendar/mine${query({ from, to })}`),
    saveCalendarEvent: (input: CalendarEventInput, eventId?: string) =>
      eventId
        ? send<CalendarEventDTO>(`/api/academics/calendar/${eventId}`, 'PUT', input)
        : send<CalendarEventDTO>('/api/academics/calendar', 'POST', input),
    deleteCalendarEvent: (eventId: string) =>
      send<{ ok: true }>(`/api/academics/calendar/${eventId}`, 'DELETE'),
    myAttendance: () => request<MyAttendanceCourseDTO[]>('/api/academics/attendance'),
    results: () => request<MyResultsDTO>('/api/academics/results'),
    transcript: (studentId?: string) =>
      request<TranscriptDTO>(`/api/academics/transcript${query({ studentId })}`),
    progress: (studentId?: string) =>
      request<DegreeProgressDTO>(`/api/academics/progress${query({ studentId })}`),
    recordStudents: (q: string) =>
      request<StudentRecordRefDTO[]>(`/api/academics/records/students${query({ q })}`),
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
    saveAssignment: (input: AssignmentInput, target: { offeringId: string } | { id: string }) =>
      'id' in target
        ? send<AssignmentDTO>(`/api/teaching/assignments/${target.id}`, 'PUT', input)
        : send<AssignmentDTO>(
            `/api/teaching/courses/${target.offeringId}/assignments`,
            'POST',
            input,
          ),
    deleteAssignment: (id: string) =>
      send<{ ok: true }>(`/api/teaching/assignments/${id}`, 'DELETE'),
    gradeAssignment: (id: string, input: AssignmentGradesInput) =>
      send<{ saved: number }>(`/api/teaching/assignments/${id}/grades`, 'PUT', input),
    returnGrades: (id: string, returned: boolean) =>
      send<{ ok: true }>(`/api/teaching/assignments/${id}/return`, 'POST', { returned }),
    addMaterial: (offeringId: string, input: MaterialInput) =>
      send<MaterialDTO>(`/api/teaching/courses/${offeringId}/materials`, 'POST', input),
    deleteMaterial: (id: string) => send<{ ok: true }>(`/api/teaching/materials/${id}`, 'DELETE'),
    saveQuiz: (input: QuizInput, target: { offeringId: string } | { id: string }) =>
      'id' in target
        ? send<QuizViewDTO>(`/api/teaching/quizzes/${target.id}`, 'PUT', input)
        : send<QuizViewDTO>(`/api/teaching/courses/${target.offeringId}/quizzes`, 'POST', input),
    deleteQuiz: (id: string) => send<{ ok: true }>(`/api/teaching/quizzes/${id}`, 'DELETE'),
    quizStep: (id: string, step: 'start' | 'next' | 'reveal' | 'end') =>
      send<QuizViewDTO>(`/api/teaching/quizzes/${id}/${step}`, 'POST'),
    saveQuizMarks: (id: string) =>
      send<{ assessmentId: string; saved: number }>(`/api/teaching/quizzes/${id}/marks`, 'POST'),
  },

  services: {
    requests: (box: 'mine' | 'inbox') =>
      request<ServiceRequestDTO[]>(`/api/services/requests${query({ box })}`),
    request: (id: string) => request<ServiceRequestDTO>(`/api/services/requests/${id}`),
    create: (input: NewRequestInput) =>
      send<ServiceRequestDTO>('/api/services/requests', 'POST', input),
    setStatus: (id: string, input: RequestStatusInput) =>
      send<ServiceRequestDTO>(`/api/services/requests/${id}/status`, 'POST', input),
    reply: (id: string, body: string) =>
      send<ServiceRequestDTO>(`/api/services/requests/${id}/replies`, 'POST', { body }),
    withdraw: (id: string) =>
      send<ServiceRequestDTO>(`/api/services/requests/${id}/withdraw`, 'POST'),
  },

  coursework: {
    overview: () => request<CourseworkOverviewDTO>('/api/coursework'),
    course: (offeringId: string) =>
      request<CourseworkCourseDTO>(`/api/coursework/courses/${offeringId}`),
    assignment: (id: string) => request<AssignmentDetailDTO>(`/api/coursework/assignments/${id}`),
    submit: (id: string, input: SubmissionInput) =>
      send<SubmissionDTO>(`/api/coursework/assignments/${id}/submission`, 'PUT', input),
    withdraw: (id: string) =>
      send<{ ok: true }>(`/api/coursework/assignments/${id}/submission`, 'DELETE'),
    quiz: (id: string) => request<QuizViewDTO>(`/api/coursework/quizzes/${id}`),
  },

  push: {
    key: () => request<{ publicKey: string }>('/api/push/key'),
    subscribe: (input: PushSubscriptionInput) =>
      send<{ ok: true }>('/api/push/subscriptions', 'POST', input),
    unsubscribe: (endpoint: string) =>
      send<{ ok: true }>('/api/push/subscriptions', 'DELETE', { endpoint }),
    test: () => send<{ sent: number }>('/api/push/test', 'POST'),
  },

  files: {
    upload: uploadFile,
    discard: (id: string) => send<{ ok: true }>(`/api/files/${id}`, 'DELETE'),
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
