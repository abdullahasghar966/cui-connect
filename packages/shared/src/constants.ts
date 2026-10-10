/** System-wide roles. Accounts are provisioned by IT (admin), never self-registered. */
export const ROLES = ['admin', 'faculty', 'staff', 'student'] as const;
export type Role = (typeof ROLES)[number];

/** Administrative offices a staff member can belong to. */
export const OFFICES = [
  'DIRECTOR',
  'EXAM',
  'STUDENT_AFFAIRS',
  'ADMISSIONS',
  'DEPARTMENT',
  'ACCOUNTS',
] as const;
export type Office = (typeof OFFICES)[number];

export const GROUP_TYPES = [
  'CAMPUS_ANNOUNCEMENT',
  'DEPARTMENT_ANNOUNCEMENT',
  'FACULTY_LOUNGE',
  'SECTION',
  'COURSE',
  'CR_COUNCIL',
  'SOCIETY',
  'CUSTOM',
  'DIRECT',
] as const;
export type GroupType = (typeof GROUP_TYPES)[number];

/** Groups created and populated automatically from university structure. */
export const AUTO_GROUP_TYPES: readonly GroupType[] = [
  'CAMPUS_ANNOUNCEMENT',
  'DEPARTMENT_ANNOUNCEMENT',
  'FACULTY_LOUNGE',
  'SECTION',
  'COURSE',
  'CR_COUNCIL',
];

export const MEMBER_ROLES = ['owner', 'moderator', 'member'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** Who may post: every member, only moderators/owners, or members holding one of `allowedPosterRoles`. */
export const POST_POLICIES = ['all', 'moderators', 'roles'] as const;
export type PostPolicy = (typeof POST_POLICIES)[number];

/** How people get in: provisioned automatically, self-join, or added by a manager. */
export const JOIN_POLICIES = ['auto', 'open', 'invite'] as const;
export type JoinPolicy = (typeof JOIN_POLICIES)[number];

export const ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION',
  'RATE_LIMITED',
  'CONFLICT',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const MESSAGE_MAX_LENGTH = 4000;
/** Authors may delete their own message within this window; moderators any time. */
export const MESSAGE_DELETE_WINDOW_MS = 15 * 60 * 1000;
export const SESSION_COOKIE = 'cui_session';

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  faculty: 'Faculty',
  staff: 'Staff',
  student: 'Student',
};

export const OFFICE_LABELS: Record<Office, string> = {
  DIRECTOR: "Director's Office",
  EXAM: 'Examination Office',
  STUDENT_AFFAIRS: 'Student Affairs',
  ADMISSIONS: 'Admissions Office',
  DEPARTMENT: 'Department Office',
  ACCOUNTS: 'Accounts Office',
};

/** What a notification is about; people can mute each kind in their settings. */
export const NOTIFICATION_TYPES = [
  'timetable',
  'results',
  'exams',
  'attendance',
  'coursework',
  'mentions',
  'requests',
  'events',
  'bookings',
  'system',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  timetable: 'Timetable changes',
  results: 'Marks and results',
  exams: 'Exams and seating',
  attendance: 'Attendance',
  coursework: 'Assignments, materials and quizzes',
  mentions: 'Mentions in chats',
  requests: 'Applications and requests',
  events: 'Events',
  bookings: 'Office-hour bookings',
  system: 'Announcements from IT',
};

export const GROUP_TYPE_LABELS: Record<GroupType, string> = {
  CAMPUS_ANNOUNCEMENT: 'Campus Announcements',
  DEPARTMENT_ANNOUNCEMENT: 'Department Notices',
  FACULTY_LOUNGE: 'Faculty Lounge',
  SECTION: 'Class Section',
  COURSE: 'Course',
  CR_COUNCIL: 'CR Council',
  SOCIETY: 'Society',
  CUSTOM: 'Custom Group',
  DIRECT: 'Direct Message',
};
