import { describe, expect, it } from 'vitest';
import type { GroupType } from './constants';
import {
  canBeMember,
  canDeleteMessage,
  canDM,
  canJoin,
  canLeave,
  canManageMembers,
  canModerate,
  canMuteMember,
  canPost,
  canRead,
  type Decision,
  type DMFacts,
  defaultGroupSettings,
  describePostPolicy,
  type GroupSettings,
  NO_DM_FACTS,
  type PolicyGroup,
  type PolicyMembership,
  type PolicyUser,
} from './policy';

const CS = 'dept-cs';
const EE = 'dept-ee';

const user = (u: Partial<PolicyUser> & Pick<PolicyUser, 'id' | 'role'>): PolicyUser => ({
  active: true,
  departmentId: CS,
  ...u,
});

const admin = user({ id: 'admin', role: 'admin', departmentId: null });
const director = user({ id: 'director', role: 'staff', office: 'DIRECTOR', departmentId: null });
const examOffice = user({ id: 'exam', role: 'staff', office: 'EXAM', departmentId: null });
const hodCS = user({ id: 'hod-cs', role: 'faculty', isHOD: true });
const hodEE = user({ id: 'hod-ee', role: 'faculty', isHOD: true, departmentId: EE });
const facultyCS = user({ id: 'fac-cs', role: 'faculty' });
const facultyEE = user({ id: 'fac-ee', role: 'faculty', departmentId: EE });
const student7A = user({ id: 'stu-7a', role: 'student', sectionId: 'sec-7a' });
const cr7A = user({ id: 'cr-7a', role: 'student', sectionId: 'sec-7a', isCR: true });
const student7B = user({ id: 'stu-7b', role: 'student', sectionId: 'sec-7b' });
const studentEE = user({ id: 'stu-ee', role: 'student', departmentId: EE, sectionId: 'sec-ee' });
const inactive = user({ id: 'gone', role: 'student', sectionId: 'sec-7a', active: false });

const group = (type: GroupType, settings: Partial<GroupSettings> = {}): PolicyGroup => ({
  id: `g-${type}`,
  type,
  departmentId: CS,
  sectionId: 'sec-7a',
  courseId: 'course-awt',
  settings: { ...defaultGroupSettings(type), ...settings },
});

const owner: PolicyMembership = { role: 'owner' };
const moderator: PolicyMembership = { role: 'moderator' };
const member: PolicyMembership = { role: 'member' };

const NOW = new Date('2026-10-07T10:00:00Z');
const minutesFromNow = (m: number) => new Date(NOW.getTime() + m * 60_000);

function expectDecision(d: Decision, allowed: boolean, code?: string) {
  expect(d.allowed).toBe(allowed);
  if (!d.allowed) {
    expect(d.reason.length).toBeGreaterThan(5);
    if (code) expect(d.code).toBe(code);
  }
}

describe('canPost: who can talk in which group', () => {
  type Row = [
    string,
    PolicyUser,
    GroupType,
    PolicyMembership | null,
    Partial<GroupSettings>,
    boolean,
    string?,
  ];
  const rows: Row[] = [
    [
      'student in campus announcements',
      student7A,
      'CAMPUS_ANNOUNCEMENT',
      member,
      {},
      false,
      'POST_RESTRICTED',
    ],
    [
      'faculty in campus announcements',
      facultyCS,
      'CAMPUS_ANNOUNCEMENT',
      member,
      {},
      false,
      'POST_RESTRICTED',
    ],
    [
      "Director's Office (moderator) in campus announcements",
      director,
      'CAMPUS_ANNOUNCEMENT',
      moderator,
      {},
      true,
    ],
    ['admin (owner) in campus announcements', admin, 'CAMPUS_ANNOUNCEMENT', owner, {}, true],
    [
      'student in department notices',
      student7A,
      'DEPARTMENT_ANNOUNCEMENT',
      member,
      {},
      false,
      'POST_RESTRICTED',
    ],
    [
      'faculty in department notices',
      facultyCS,
      'DEPARTMENT_ANNOUNCEMENT',
      member,
      {},
      false,
      'POST_RESTRICTED',
    ],
    [
      'HOD (moderator) in department notices',
      hodCS,
      'DEPARTMENT_ANNOUNCEMENT',
      moderator,
      {},
      true,
    ],
    ['faculty in faculty lounge', facultyCS, 'FACULTY_LOUNGE', member, {}, true],
    ['student in own section', student7A, 'SECTION', member, {}, true],
    ['student in course', student7A, 'COURSE', member, {}, true],
    ['student in locked course', student7A, 'COURSE', member, { locked: true }, false, 'LOCKED'],
    ['instructor (owner) in locked course', facultyCS, 'COURSE', owner, { locked: true }, true],
    ['CR in CR council', cr7A, 'CR_COUNCIL', member, {}, true],
    ['member in society', studentEE, 'SOCIETY', member, {}, true],
    [
      'faculty in faculty-only custom group',
      facultyCS,
      'CUSTOM',
      member,
      { postPolicy: 'roles', allowedPosterRoles: ['faculty'] },
      true,
    ],
    [
      'student in faculty-only custom group',
      student7A,
      'CUSTOM',
      member,
      { postPolicy: 'roles', allowedPosterRoles: ['faculty'] },
      false,
      'POST_RESTRICTED',
    ],
    [
      'moderator in roles group without the role',
      student7A,
      'CUSTOM',
      moderator,
      { postPolicy: 'roles', allowedPosterRoles: ['faculty'] },
      true,
    ],
    ['non-member in section', student7B, 'SECTION', null, {}, false, 'NOT_MEMBER'],
    ['deactivated user', inactive, 'SECTION', member, {}, false, 'INACTIVE'],
    ['participant in a DM', student7A, 'DIRECT', member, {}, true],
  ];

  it.each(rows)('%s', (_label, u, type, membership, settings, allowed, code) => {
    expectDecision(canPost(u, group(type, settings), membership, NOW), allowed, code);
  });

  it('denies a muted member until the mute expires', () => {
    const muted = { role: 'member' as const, mutedUntil: minutesFromNow(30) };
    expectDecision(canPost(student7A, group('SECTION'), muted, NOW), false, 'MUTED');
    const expired = { role: 'member' as const, mutedUntil: minutesFromNow(-1).toISOString() };
    expectDecision(canPost(student7A, group('SECTION'), expired, NOW), true);
  });

  it('a muted member of a DM cannot post either', () => {
    const muted = { role: 'member' as const, mutedUntil: minutesFromNow(5) };
    expectDecision(canPost(student7A, group('DIRECT'), muted, NOW), false, 'MUTED');
  });
});

describe('canRead', () => {
  it('requires membership and an active account', () => {
    expectDecision(canRead(student7A, group('SECTION'), member), true);
    expectDecision(canRead(student7B, group('SECTION'), null), false, 'NOT_MEMBER');
    expectDecision(canRead(admin, group('DIRECT'), null), false, 'NOT_MEMBER');
    expectDecision(canRead(inactive, group('SECTION'), member), false, 'INACTIVE');
  });
});

describe('canBeMember: membership eligibility', () => {
  type Row = [
    string,
    PolicyUser,
    GroupType,
    boolean,
    { enrolled?: boolean }?,
    Partial<GroupSettings>?,
  ];
  const rows: Row[] = [
    ['student in faculty lounge', student7A, 'FACULTY_LOUNGE', false],
    ['staff in faculty lounge', examOffice, 'FACULTY_LOUNGE', false],
    ['department faculty in faculty lounge', facultyCS, 'FACULTY_LOUNGE', true],
    ['other-department faculty in faculty lounge', facultyEE, 'FACULTY_LOUNGE', false],
    ['admin in faculty lounge', admin, 'FACULTY_LOUNGE', true],
    ['department student in department notices', student7A, 'DEPARTMENT_ANNOUNCEMENT', true],
    ['other-department student in department notices', studentEE, 'DEPARTMENT_ANNOUNCEMENT', false],
    ['admin in department notices', admin, 'DEPARTMENT_ANNOUNCEMENT', true],
    ['registered student in section', student7A, 'SECTION', true],
    ['student of another section', student7B, 'SECTION', false],
    ['faculty in section', facultyEE, 'SECTION', true],
    ['staff in section', examOffice, 'SECTION', false],
    ['enrolled student in course', student7B, 'COURSE', true, { enrolled: true }],
    ['non-enrolled student in course', student7A, 'COURSE', false, { enrolled: false }],
    ['faculty in course', facultyCS, 'COURSE', true],
    ['CR in CR council', cr7A, 'CR_COUNCIL', true],
    ['regular student in CR council', student7A, 'CR_COUNCIL', false],
    ['HOD in CR council', hodCS, 'CR_COUNCIL', true],
    ['other-department faculty in CR council', facultyEE, 'CR_COUNCIL', false],
    ['anyone in a society', studentEE, 'SOCIETY', true],
    ['anyone in campus announcements', examOffice, 'CAMPUS_ANNOUNCEMENT', true],
    [
      'student in faculty-only custom group',
      student7A,
      'CUSTOM',
      false,
      {},
      { eligibleRoles: ['faculty'] },
    ],
    [
      'faculty in faculty-only custom group',
      facultyEE,
      'CUSTOM',
      true,
      {},
      { eligibleRoles: ['faculty'] },
    ],
    ['anyone added to a DM by hand', admin, 'DIRECT', false],
    ['deactivated user', inactive, 'SOCIETY', false],
  ];

  it.each(rows)('%s', (_label, u, type, allowed, facts = {}, settings = {}) => {
    expectDecision(canBeMember(u, group(type, settings), facts), allowed);
  });
});

describe('canJoin / canLeave', () => {
  it('open societies can be joined by eligible non-members', () => {
    expectDecision(canJoin(studentEE, group('SOCIETY'), null), true);
    expectDecision(canJoin(studentEE, group('SOCIETY'), member), false, 'ALREADY_MEMBER');
  });

  it('invite-only and official groups cannot be self-joined', () => {
    expectDecision(canJoin(student7A, group('CUSTOM'), null), false, 'INVITE_ONLY');
    expectDecision(canJoin(student7A, group('SECTION'), null), false, 'AUTO_MANAGED');
  });

  it('official groups and DMs cannot be left; societies can', () => {
    expectDecision(canLeave(student7A, group('SECTION'), member), false, 'AUTO_MANAGED');
    expectDecision(canLeave(student7A, group('DIRECT'), member), false, 'AUTO_MANAGED');
    expectDecision(canLeave(student7A, group('SOCIETY'), member), true);
    expectDecision(canLeave(student7A, group('SOCIETY'), null), false, 'NOT_MEMBER');
  });
});

describe('moderation', () => {
  it('canModerate: admins and group moderators only, never DMs', () => {
    expectDecision(canModerate(admin, group('SECTION'), null), true);
    expectDecision(canModerate(facultyCS, group('COURSE'), owner), true);
    expectDecision(canModerate(student7A, group('COURSE'), member), false, 'NOT_MODERATOR');
    expectDecision(canModerate(admin, group('DIRECT'), member), false, 'NOT_MODERATOR');
    expectDecision(
      canModerate({ ...hodCS, active: false }, group('SECTION'), owner),
      false,
      'INACTIVE',
    );
  });

  it('canManageMembers: admins anywhere, moderators only in societies/custom groups', () => {
    expectDecision(canManageMembers(admin, group('SECTION'), null), true);
    expectDecision(canManageMembers(student7A, group('SOCIETY'), moderator), true);
    expectDecision(
      canManageMembers(facultyCS, group('SECTION'), moderator),
      false,
      'NOT_MODERATOR',
    );
    expectDecision(canManageMembers(admin, group('DIRECT'), null), false, 'NOT_MODERATOR');
    expectDecision(
      canManageMembers({ ...admin, active: false }, group('SOCIETY'), null),
      false,
      'INACTIVE',
    );
  });

  it('canMuteMember: only members ranked below the actor', () => {
    const section = group('SECTION');
    const target = (role: PolicyMembership['role']) => ({ userId: 'x', membership: { role } });
    expectDecision(canMuteMember(facultyCS, section, moderator, target('member')), true);
    expectDecision(
      canMuteMember(facultyCS, section, moderator, target('moderator')),
      false,
      'NOT_MODERATOR',
    );
    expectDecision(canMuteMember(facultyCS, section, owner, target('moderator')), true);
    expectDecision(
      canMuteMember(student7A, section, member, target('member')),
      false,
      'NOT_MODERATOR',
    );
    expectDecision(canMuteMember(admin, section, null, target('moderator')), true);
    expectDecision(canMuteMember(admin, section, null, target('owner')), false, 'NOT_MODERATOR');
    expectDecision(
      canMuteMember(facultyCS, section, owner, { userId: facultyCS.id, membership: owner }),
      false,
      'SELF',
    );
  });

  it('canDeleteMessage: own messages within 15 minutes, moderators any time', () => {
    const course = group('COURSE');
    const recent = { senderId: student7A.id, createdAt: minutesFromNow(-5) };
    const old = { senderId: student7A.id, createdAt: minutesFromNow(-16).toISOString() };
    expectDecision(canDeleteMessage(student7A, course, member, recent, NOW), true);
    expectDecision(canDeleteMessage(student7A, course, member, old, NOW), false, 'NOT_MODERATOR');
    expectDecision(canDeleteMessage(cr7A, course, member, recent, NOW), false, 'NOT_MODERATOR');
    expectDecision(canDeleteMessage(facultyCS, course, owner, old, NOW), true);
    expectDecision(canDeleteMessage(admin, group('DIRECT'), null, recent, NOW), false);
    expectDecision(canDeleteMessage(student7A, group('DIRECT'), member, recent, NOW), true);
    expectDecision(canDeleteMessage(inactive, course, member, recent, NOW), false, 'INACTIVE');
  });
});

describe('canDM: direct-message boundaries', () => {
  const facts = (f: Partial<DMFacts> = {}): DMFacts => ({ ...NO_DM_FACTS, ...f });
  type Row = [string, PolicyUser, PolicyUser, Partial<DMFacts>, boolean, string?];
  const rows: Row[] = [
    ['admin → any student', admin, studentEE, {}, true],
    ['staff office → student', examOffice, student7A, {}, true],
    ['student → staff office', studentEE, examOffice, {}, true],
    ['student → IT admin', student7A, admin, {}, false, 'DM_RESTRICTED'],
    ['student → unrelated faculty', student7A, facultyCS, {}, false, 'DM_RESTRICTED'],
    ['student → own instructor', student7A, facultyCS, { facultyTeachesStudent: true }, true],
    ['student → batch advisor', student7A, facultyCS, { facultyAdvisesStudent: true }, true],
    ['student → own HOD', student7A, hodCS, { sameDepartment: true }, true],
    ['student → another department HOD', student7A, hodEE, {}, false, 'DM_RESTRICTED'],
    ['faculty → own-department student', facultyCS, student7B, { sameDepartment: true }, true],
    ['faculty → other-department student', facultyCS, studentEE, {}, false, 'DM_RESTRICTED'],
    [
      'faculty → student they teach (other dept)',
      facultyCS,
      studentEE,
      { facultyTeachesStudent: true },
      true,
    ],
    ['faculty → faculty of another department', facultyCS, facultyEE, {}, true],
    ['faculty → admin', facultyEE, admin, {}, true],
    ['student → department peer', student7A, student7B, { sameDepartment: true }, true],
    ['student → other-department society peer', student7A, studentEE, { sharedGroup: true }, true],
    ['student → unrelated student', student7A, studentEE, {}, false, 'DM_RESTRICTED'],
    [
      'student replies to a thread an admin started',
      student7A,
      admin,
      { threadStartedByRecipient: true },
      true,
    ],
    ['message to self', student7A, student7A, {}, false, 'SELF'],
    ['message to a deactivated account', admin, inactive, {}, false, 'DM_RESTRICTED'],
    ['deactivated sender', inactive, examOffice, {}, false, 'INACTIVE'],
  ];

  it.each(rows)('%s', (_label, sender, recipient, f, allowed, code) => {
    expectDecision(canDM(sender, recipient, facts(f)), allowed, code);
  });
});

describe('defaults and descriptions', () => {
  it('announcement channels are moderator-only; societies are open; custom groups invite-only', () => {
    expect(defaultGroupSettings('CAMPUS_ANNOUNCEMENT').postPolicy).toBe('moderators');
    expect(defaultGroupSettings('DEPARTMENT_ANNOUNCEMENT').postPolicy).toBe('moderators');
    expect(defaultGroupSettings('FACULTY_LOUNGE').eligibleRoles).toEqual(['faculty', 'admin']);
    expect(defaultGroupSettings('SOCIETY').joinPolicy).toBe('open');
    expect(defaultGroupSettings('CUSTOM').joinPolicy).toBe('invite');
    expect(defaultGroupSettings('SECTION').joinPolicy).toBe('auto');
  });

  it('describes who may post', () => {
    expect(describePostPolicy(group('SECTION'))).toBe('All members can post');
    expect(describePostPolicy(group('COURSE', { locked: true }))).toMatch(/Locked/);
    expect(describePostPolicy(group('CAMPUS_ANNOUNCEMENT'))).toMatch(/Director/);
    expect(describePostPolicy(group('DEPARTMENT_ANNOUNCEMENT'))).toMatch(/HOD/);
    expect(describePostPolicy(group('SOCIETY', { postPolicy: 'moderators' }))).toBe(
      'Only moderators can post',
    );
    expect(
      describePostPolicy(group('CUSTOM', { postPolicy: 'roles', allowedPosterRoles: ['faculty'] })),
    ).toBe('Only faculty and moderators can post');
    expect(
      describePostPolicy(
        group('CUSTOM', { postPolicy: 'roles', allowedPosterRoles: ['faculty', 'staff', 'admin'] }),
      ),
    ).toBe('Only faculty, staff, admins and moderators can post');
    expect(describePostPolicy(group('CUSTOM', { postPolicy: 'roles' }))).toBe(
      'Only moderators can post',
    );
    expect(describePostPolicy(group('DIRECT'))).toBe('Private conversation');
  });
});
