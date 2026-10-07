import { defaultGroupSettings, type GroupSettings, type MemberRole } from '@cui/shared';
import { Types } from 'mongoose';
import { hashPassword } from '../auth/password';
import {
  ALL_MODELS,
  CourseOffering,
  type CourseOfferingDoc,
  Department,
  type DepartmentDoc,
  Group,
  type GroupDoc,
  Membership,
  Message,
  Section,
  type SectionDoc,
  User,
  type UserDoc,
} from '../models';
import { recordAudit } from '../services/audit';
import { invalidateOrgLookup } from '../services/mappers';
import {
  ensureCampusGroup,
  groupKeys,
  provisionCourse,
  provisionDepartment,
  provisionSection,
  reconcileUser,
} from '../services/provisioning';
import {
  COURSES,
  DEMO_PASSWORD,
  DEPARTMENTS,
  type DeptCode,
  FACULTY,
  regNoFor,
  SECTIONS,
  STAFF,
} from './data';

export interface SeedSummary {
  users: number;
  groups: number;
  messages: number;
}

function must<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new Error(`Seed data error: missing ${what}`);
  return value;
}

/**
 * Resets the database and loads the demo campus. Writes go straight to the models (not the
 * admin services) so the audit log isn't flooded with one entry per seeded account.
 */
export async function seedDatabase(): Promise<SeedSummary> {
  await Promise.all(ALL_MODELS.map((model) => model.collection.deleteMany({})));
  invalidateOrgLookup();

  // Departments, and the groups every department gets.
  const depts = new Map<DeptCode, DepartmentDoc>();
  for (const d of DEPARTMENTS) {
    const doc = (await Department.create(d)).toObject<DepartmentDoc>();
    depts.set(d.code, doc);
    await provisionDepartment(doc);
  }
  await ensureCampusGroup();
  const deptId = (code: DeptCode) => must(depts.get(code), `department ${code}`)._id;

  // One argon2id hash shared by every demo account (they share the demo password).
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const people = new Map<string, UserDoc>();
  const person = (key: string) => must(people.get(key), `person ${key}`);

  const staffDocs = await User.insertMany(
    STAFF.map((s) => ({
      name: s.name,
      email: s.email,
      passwordHash,
      role: s.role,
      office: s.office ?? null,
      designation: s.designation,
      departmentId: s.dept ? deptId(s.dept) : null,
    })),
  );
  for (const [i, doc] of staffDocs.entries()) {
    people.set(must(STAFF[i], 'staff').key, doc.toObject<UserDoc>());
  }

  const facultyDocs = await User.insertMany(
    FACULTY.map((f) => ({
      name: f.name,
      email: f.email,
      passwordHash,
      role: 'faculty',
      designation: f.designation,
      departmentId: deptId(f.dept),
      isHOD: !!f.isHOD,
    })),
  );
  for (const [i, doc] of facultyDocs.entries()) {
    people.set(must(FACULTY[i], 'faculty').key, doc.toObject<UserDoc>());
  }

  // Sections (each gets a class group) and their students.
  const sections = new Map<string, SectionDoc>();
  for (const s of SECTIONS) {
    const section = (
      await Section.create({
        name: s.name,
        program: s.program,
        intake: s.intake,
        departmentId: deptId(s.dept),
        batchAdvisorId: person(s.advisor)._id,
      })
    ).toObject<SectionDoc>();
    sections.set(s.name, section);
    await provisionSection(section);

    const students = await User.insertMany(
      s.students.map((name, i) => {
        const regNo = regNoFor(s, i);
        return {
          name,
          email: `${regNo.toLowerCase()}@isbstudent.comsats.edu.pk`,
          passwordHash,
          role: 'student',
          regNo,
          designation: `Student, ${s.name}`,
          departmentId: section.departmentId,
          sectionId: section._id,
          isCR: i === 0,
        };
      }),
    );
    for (const doc of students) {
      const student = doc.toObject<UserDoc>();
      people.set(must(student.regNo, 'regNo'), student);
    }
  }
  const studentsOf = (sectionName: string) =>
    [...people.values()].filter(
      (u) => u.role === 'student' && String(u.sectionId) === String(sections.get(sectionName)?._id),
    );

  // Course offerings (each gets a course group with its instructor and enrolled students).
  const courses = new Map<string, CourseOfferingDoc>();
  for (const c of COURSES) {
    const section = must(sections.get(c.section), `section ${c.section}`);
    const enrolled = [
      ...studentsOf(c.section).map((u) => u._id),
      ...(c.extraStudents ?? []).map((reg) => person(reg)._id),
    ];
    const course = (
      await CourseOffering.create({
        code: c.code,
        title: c.title,
        sectionId: section._id,
        instructorId: person(c.instructor)._id,
        studentIds: enrolled,
      })
    ).toObject<CourseOfferingDoc>();
    courses.set(c.key, course);
    await provisionCourse(course, section);
  }

  // Everyone joins the official groups their role, department, section and courses imply.
  for (const user of people.values()) await reconcileUser(user._id, { notify: false });

  // Societies and custom groups are voluntary/invite-only, so memberships are manual.
  const createGroup = async (
    name: string,
    type: 'SOCIETY' | 'CUSTOM',
    description: string,
    members: [string, MemberRole][],
    settings: Partial<GroupSettings> = {},
  ) => {
    const group = await Group.create({
      name,
      type,
      description,
      system: false,
      settings: { ...defaultGroupSettings(type), ...settings },
      createdById: person('admin')._id,
    });
    await Membership.insertMany(
      members.map(([key, role]) => ({
        groupId: group._id,
        userId: person(key)._id,
        role,
        source: 'manual',
      })),
    );
    return group._id;
  };

  const acm = await createGroup(
    'ACM CUI Chapter',
    'SOCIETY',
    'Programming contests, tech talks and hackathons. Open to every department.',
    [
      ['FA23-BCS-004', 'owner'],
      ['imran', 'moderator'],
      ['FA23-BCS-002', 'member'],
      ['FA23-BCS-031', 'member'],
      ['FA23-BEE-001', 'member'],
      ['FA24-BSE-001', 'member'],
    ],
  );
  const sports = await createGroup(
    'CUI Sports Society',
    'SOCIETY',
    'Cricket, football and futsal trials, tournaments and fixtures.',
    [
      ['FA23-BEE-001', 'owner'],
      ['FA23-BCS-005', 'member'],
      ['FA23-BCS-035', 'member'],
      ['FA24-BSE-005', 'member'],
    ],
  );
  const fyp = await createGroup(
    'CS FYP Committee',
    'CUSTOM',
    'Final Year Project committee of the CS department (faculty only).',
    [
      ['ayesha', 'owner'],
      ['imran', 'member'],
      ['naveed', 'member'],
      ['fatima', 'member'],
    ],
    { eligibleRoles: ['faculty', 'admin'] },
  );
  const examCell = await createGroup(
    'Exam Coordination Cell',
    'CUSTOM',
    'The Examination Office shares date sheets and seating plans with class representatives.',
    [
      ['exam', 'owner'],
      ['FA23-BCS-001', 'member'],
      ['FA23-BCS-031', 'member'],
      ['FA24-BSE-001', 'member'],
      ['FA23-BEE-001', 'member'],
    ],
    { postPolicy: 'roles', allowedPosterRoles: ['staff'] },
  );

  // Direct-message threads (the starter is recorded for the reply rule).
  const createDM = async (starter: string, other: string) => {
    const [a, b] = [person(starter), person(other)];
    const group = await Group.create({
      name: 'Direct message',
      type: 'DIRECT',
      key: groupKeys.dm(a._id, b._id),
      settings: defaultGroupSettings('DIRECT'),
      createdById: a._id,
    });
    await Membership.insertMany(
      [a, b].map((u) => ({ groupId: group._id, userId: u._id, role: 'member', source: 'manual' })),
    );
    return group._id;
  };
  const dmImranHira = await createDM('imran', 'FA23-BCS-002');
  const dmExamUsman = await createDM('exam', 'FA23-BCS-031');

  const keyed = async (key: string) =>
    must(await Group.findOne({ key }).select('_id').lean<Pick<GroupDoc, '_id'>>(), key)._id;
  const course = (key: string) => must(courses.get(key), `course ${key}`)._id;
  const section = (name: string) => must(sections.get(name), `section ${name}`)._id;

  const g = {
    campus: await keyed(groupKeys.campus()),
    csNotices: await keyed(groupKeys.deptNotices(deptId('CS'))),
    csLounge: await keyed(groupKeys.lounge(deptId('CS'))),
    csCR: await keyed(groupKeys.crCouncil(deptId('CS'))),
    eeNotices: await keyed(groupKeys.deptNotices(deptId('EE'))),
    bcs7a: await keyed(groupKeys.section(section('BCS-7A'))),
    bcs7b: await keyed(groupKeys.section(section('BCS-7B'))),
    awt7a: await keyed(groupKeys.course(course('awt7a'))),
    awt7b: await keyed(groupKeys.course(course('awt7b'))),
    cc7a: await keyed(groupKeys.course(course('cc7a'))),
    dsp7a: await keyed(groupKeys.course(course('dsp7a'))),
  };

  // [group, sender, text, minutes ago]
  const script: [Types.ObjectId, string, string, number][] = [
    [
      g.campus,
      'director',
      'Assalam-o-Alaikum. Fall 2026 mid-term examinations will begin on Monday, 26 October. Detailed date sheets will be shared through the Examination Office.',
      2900,
    ],
    [
      g.campus,
      'admin',
      'IT Services: the student portal will be under scheduled maintenance on Saturday from 10 PM to 2 AM. Plan your submissions accordingly.',
      1500,
    ],
    [
      g.csNotices,
      'ayesha',
      'All BCS-7 students: the FYP-I proposal defence schedule has been finalised. Please confirm your slot with your supervisor by Thursday.',
      1450,
    ],
    [g.csNotices, 'csOffice', 'Reminder: Friday class timings remain unchanged this week.', 1200],
    [
      g.eeNotices,
      'tariq',
      'EE students: the DSP lab will be closed on Wednesday for equipment calibration.',
      1300,
    ],
    [g.csLounge, 'imran', 'Has anyone finalised the rubric for the AWT lab assignments?', 900],
    [
      g.csLounge,
      'naveed',
      'I can share the compiler lab rubric. The same structure should work for AWT.',
      880,
    ],
    [
      g.csLounge,
      'ayesha',
      "Good idea. Let's standardise lab rubrics in Thursday's faculty meeting.",
      860,
    ],
    [
      g.csCR,
      'ayesha',
      'CRs, please collect feedback on the new lab timings from your classes by Wednesday.',
      800,
    ],
    [g.csCR, 'FA23-BCS-001', "Will do, ma'am. BCS-7A feedback will be with you on Tuesday.", 790],
    [g.csCR, 'FA23-BCS-031', 'BCS-7B as well, I will compile it by Tuesday evening.', 780],
    [
      g.bcs7a,
      'FA23-BCS-001',
      'Everyone, the AWT lab will be held in Lab 3 tomorrow instead of Lab 1.',
      600,
    ],
    [g.bcs7a, 'FA23-BCS-002', 'Thanks Ali! Is the Socket.IO assignment due on Friday?', 590],
    [g.bcs7a, 'FA23-BCS-003', 'Yes, Friday morning. Sir mentioned it in the last class.', 585],
    [
      g.bcs7a,
      'imran',
      'Please keep this group for class matters only. Best of luck with your mid-terms preparation.',
      570,
    ],
    [g.bcs7b, 'FA23-BCS-031', 'Reminder: AWT quiz 2 is next Tuesday.', 560],
    [g.bcs7b, 'FA23-BCS-034', 'Which topics are included?', 555],
    [
      g.awt7a,
      'imran',
      'Lab Assignment 1 (Socket.IO): build a communication system for COMSATS with group-based communication boundaries. Submission is due Friday morning.',
      500,
    ],
    [g.awt7a, 'FA23-BCS-004', 'Sir, can we use MongoDB Atlas or a local database?', 480],
    [g.awt7a, 'imran', 'Either is fine, as long as it runs during the demo.', 470],
    [g.awt7a, 'FA23-BCS-005', 'Sir, will there be a viva as well?', 460],
    [
      g.awt7a,
      'imran',
      'Yes, a short viva during the lab. Be ready to explain rooms, namespaces and acknowledgements.',
      455,
    ],
    [
      g.awt7b,
      'fatima',
      'Quiz 2 next Tuesday covers WebSockets, Socket.IO rooms and namespaces.',
      450,
    ],
    [g.awt7b, 'FA23-BCS-031', "Noted, ma'am. I'll inform the class.", 445],
    [g.cc7a, 'naveed', 'Upload your lexer implementations to the LMS before Sunday night.', 400],
    [g.dsp7a, 'sana', 'Assignment 2 on FIR filter design has been uploaded. Due next Monday.', 380],
    [
      examCell,
      'exam',
      'CRs: mid-term seating plans will be shared here on Friday. Please forward them to your classes.',
      350,
    ],
    [
      acm,
      'FA23-BCS-004',
      'ACM CUI Chapter speed programming contest registrations are open until Sunday!',
      300,
    ],
    [acm, 'FA23-BEE-001', 'Can EE students participate too?', 290],
    [acm, 'FA23-BCS-004', 'Of course, the contest is open to all departments.', 285],
    [acm, 'imran', 'Great initiative. I will arrange Lab 5 for the contest.', 280],
    [
      sports,
      'FA23-BEE-001',
      'Cricket trials on Saturday at 9 AM at the sports complex. Bring your kits.',
      250,
    ],
    [fyp, 'ayesha', 'Please submit your list of proposed FYP topics for BCS-7 by Friday.', 200],
    [fyp, 'naveed', 'I have four compiler and program-analysis topics ready.', 190],
    [dmImranHira, 'imran', 'Hira, please see me after the lab regarding your FYP proposal.', 120],
    [dmImranHira, 'FA23-BCS-002', "Sure sir, I'll come to your office after the lab.", 110],
    [
      dmExamUsman,
      'exam',
      'Usman, please confirm the final BCS-7B student count for the seating plan.',
      90,
    ],
    [dmExamUsman, 'FA23-BCS-031', '47 students. I will email the list today.', 80],
  ];
  script.sort((a, b) => b[3] - a[3]);

  const now = Date.now();
  const messages = script.map(([groupId, from, body, minutesAgo]) => {
    const createdAt = new Date(now - minutesAgo * 60_000);
    return {
      // Ids carry the message time, so cursor pagination and read markers follow chronology.
      _id: new Types.ObjectId(Types.ObjectId.generate(Math.floor(createdAt.getTime() / 1000))),
      groupId,
      senderId: person(from)._id,
      body,
      clientId: null,
      deletedAt: null,
      deletedById: null,
      createdAt,
    };
  });
  if (messages.length) await Message.collection.insertMany(messages);

  // lastMessageAt per group, and each sender has read everything up to their own last message.
  const lastInGroup = new Map<string, (typeof messages)[number]>();
  const lastBySender = new Map<string, (typeof messages)[number]>();
  for (const m of messages) {
    lastInGroup.set(String(m.groupId), m);
    lastBySender.set(`${m.groupId}:${m.senderId}`, m);
  }
  await Group.bulkWrite(
    [...lastInGroup.values()].map((m) => ({
      updateOne: { filter: { _id: m.groupId }, update: { $set: { lastMessageAt: m.createdAt } } },
    })),
  );
  const readMarks = [...lastBySender.values()].map((m) => ({
    updateOne: {
      filter: { groupId: m.groupId, userId: m.senderId },
      update: { $set: { lastReadMessageId: m._id } },
    },
  }));
  // The demo student has already read the official channels.
  const hira = person('FA23-BCS-002')._id;
  for (const gid of [g.campus, g.csNotices]) {
    const last = lastInGroup.get(String(gid));
    if (last) {
      readMarks.push({
        updateOne: {
          filter: { groupId: gid, userId: hira },
          update: { $set: { lastReadMessageId: last._id } },
        },
      });
    }
  }
  await Membership.bulkWrite(readMarks);

  const summary: SeedSummary = {
    users: people.size,
    groups: await Group.countDocuments(),
    messages: messages.length,
  };
  await recordAudit({
    action: 'system.seeded',
    actor: null,
    summary: `Demo campus loaded: ${summary.users} accounts, ${summary.groups} groups, ${summary.messages} messages`,
  });
  return summary;
}
