/**
 * Requests and complaints for the demo campus. The leave days the attendance seed marks for
 * students get matching approved leave applications, so the two stories agree.
 */
import { addDays, campusClock, campusInstant, formatShortDate } from '@cui/shared';
import type { Types } from 'mongoose';
import {
  AttendanceRecord,
  AttendanceSession,
  Section,
  ServiceRequest,
  User,
  type UserDoc,
} from '../models';

type Person = Pick<UserDoc, '_id' | 'name' | 'sectionId' | 'departmentId'>;

export async function seedRequests(today = campusClock().date): Promise<number> {
  const people = await User.find({
    $or: [
      {
        regNo: {
          $in: ['FA23-BCS-001', 'FA23-BCS-002', 'FA23-BCS-003', 'FA23-BCS-004', 'FA23-BCS-031'],
        },
      },
      { email: { $in: ['exam.office@comsats.edu.pk', 'student.affairs@comsats.edu.pk'] } },
    ],
  })
    .select('name regNo email sectionId departmentId')
    .lean<(Person & { regNo: string | null; email: string })[]>();
  const by = (key: string) => people.find((p) => p.regNo === key || p.email === key);
  const [ali, hira, ahmed, zainab, usman] = [
    'FA23-BCS-001',
    'FA23-BCS-002',
    'FA23-BCS-003',
    'FA23-BCS-004',
    'FA23-BCS-031',
  ].map(by);
  const exam = by('exam.office@comsats.edu.pk');
  const affairs = by('student.affairs@comsats.edu.pk');
  if (!ali || !hira || !ahmed || !zainab || !usman || !exam || !affairs) return 0;

  const advisorOf = async (student: Person) => {
    const section = student.sectionId
      ? await Section.findById(student.sectionId).select('batchAdvisorId').lean()
      : null;
    return section?.batchAdvisorId
      ? await User.findById(section.batchAdvisorId)
          .select('name')
          .lean<{ _id: Types.ObjectId; name: string }>()
      : null;
  };
  const at = (date: string, time: string) => campusInstant(date, time);
  const event = (
    when: Date,
    by: { _id: Types.ObjectId; name: string } | null,
    kind: 'created' | 'status' | 'reply',
    status: string | null,
    body: string | null = null,
  ) => ({ at: when, byId: by?._id ?? null, byName: by?.name ?? null, kind, status, body });
  const office = (o: 'EXAM' | 'STUDENT_AFFAIRS') => ({
    office: o,
    departmentId: null,
    userId: null,
  });
  const docs: Record<string, unknown>[] = [];

  // Approved leave for the days the attendance seed marked "leave".
  const leaveRecords = await AttendanceRecord.find({
    studentId: { $in: [hira._id, ahmed._id] },
    status: 'leave',
  })
    .select('studentId sessionId')
    .lean();
  const sessionDates = new Map(
    (
      await AttendanceSession.find({ _id: { $in: leaveRecords.map((r) => r.sessionId) } })
        .select('date')
        .lean()
    ).map((s) => [String(s._id), s.date]),
  );
  const REASONS = [
    'I had a high fever; the doctor advised two days of rest.',
    'My grandmother passed away and I travelled home for the funeral.',
    'I represented COMSATS at the inter-university programming contest.',
  ];
  for (const student of [hira, ahmed]) {
    const advisor = await advisorOf(student);
    if (!advisor) continue;
    const dates = [
      ...new Set(
        leaveRecords
          .filter((r) => String(r.studentId) === String(student._id))
          .map((r) => sessionDates.get(String(r.sessionId)))
          .filter((d): d is string => !!d),
      ),
    ]
      .sort()
      .slice(0, 3);
    dates.forEach((date, i) => {
      docs.push({
        kind: 'leave',
        studentId: student._id,
        route: { office: null, departmentId: student.departmentId, userId: advisor._id },
        title: `Leave on ${formatShortDate(date)}`,
        status: 'approved',
        details: { from: date, to: date, reason: REASONS[i % REASONS.length] },
        events: [
          event(at(addDays(date, -1), '20:15'), student, 'created', 'submitted'),
          event(
            at(date, '09:40'),
            advisor,
            'status',
            'approved',
            'Approved. Catch up on the notes from a classmate.',
          ),
        ],
        createdAt: at(addDays(date, -1), '20:15'),
        updatedAt: at(date, '09:40'),
      });
    });
  }

  // Waiting for the advisor: Ahmed's leave from tomorrow.
  const ahmedAdvisor = await advisorOf(ahmed);
  if (ahmedAdvisor) {
    const from = addDays(today, 1);
    const to = addDays(today, 2);
    docs.push({
      kind: 'leave',
      studentId: ahmed._id,
      route: { office: null, departmentId: ahmed.departmentId, userId: ahmedAdvisor._id },
      title: `Leave ${formatShortDate(from)} – ${formatShortDate(to)}`,
      status: 'submitted',
      details: {
        from,
        to,
        reason: 'My father is in hospital in Multan and I need to be with him.',
      },
      events: [event(at(today, '07:50'), ahmed, 'created', 'submitted')],
      createdAt: at(today, '07:50'),
      updatedAt: at(today, '07:50'),
    });
  }

  // Ali's transcript, being prepared by the Examination Office.
  docs.push({
    kind: 'transcript',
    studentId: ali._id,
    route: office('EXAM'),
    title: 'Official transcript (2 copies)',
    status: 'in_review',
    details: { copies: 2, purpose: 'Applying for a summer internship at Systems Ltd' },
    events: [
      event(at(addDays(today, -3), '11:05'), ali, 'created', 'submitted'),
      event(
        at(addDays(today, -2), '10:30'),
        exam,
        'status',
        'in_review',
        'Being printed; it needs the Controller’s signature.',
      ),
    ],
    createdAt: at(addDays(today, -3), '11:05'),
    updatedAt: at(addDays(today, -2), '10:30'),
  });

  // Hira's bonafide certificate, ready.
  docs.push({
    kind: 'bonafide',
    studentId: hira._id,
    route: office('EXAM'),
    title: 'Bonafide certificate',
    status: 'completed',
    details: { purpose: 'Opening a student bank account' },
    events: [
      event(at(addDays(today, -6), '14:20'), hira, 'created', 'submitted'),
      event(
        at(addDays(today, -5), '12:00'),
        exam,
        'status',
        'completed',
        'Ready. Collect it from the Examination Office, Room 12.',
      ),
    ],
    createdAt: at(addDays(today, -6), '14:20'),
    updatedAt: at(addDays(today, -5), '12:00'),
  });

  // Zainab's complaint, being looked into, with a reply each way.
  docs.push({
    kind: 'complaint',
    studentId: zainab._id,
    route: office('STUDENT_AFFAIRS'),
    title: 'Projector in A-101 is not working',
    status: 'in_review',
    details: {
      category: 'facilities',
      subject: 'Projector in A-101 is not working',
      description:
        'The projector in A-101 has not turned on for the last three lectures, so we cannot see the slides.',
    },
    events: [
      event(at(addDays(today, -2), '12:10'), zainab, 'created', 'submitted'),
      event(
        at(addDays(today, -2), '15:45'),
        affairs,
        'status',
        'in_review',
        'Thanks for telling us. Maintenance will check it.',
      ),
      event(
        at(addDays(today, -1), '09:05'),
        zainab,
        'reply',
        null,
        'It still did not work in this morning’s lecture.',
      ),
    ],
    createdAt: at(addDays(today, -2), '12:10'),
    updatedAt: at(addDays(today, -1), '09:05'),
  });

  // Usman's lost ID card, just sent.
  docs.push({
    kind: 'idcard',
    studentId: usman._id,
    route: office('STUDENT_AFFAIRS'),
    title: 'ID card: lost',
    status: 'submitted',
    details: { cardReason: 'lost', description: 'Lost it in the library on Friday.' },
    events: [event(at(addDays(today, -1), '16:30'), usman, 'created', 'submitted')],
    createdAt: at(addDays(today, -1), '16:30'),
    updatedAt: at(addDays(today, -1), '16:30'),
  });

  await ServiceRequest.insertMany(docs, { timestamps: false });
  return docs.length;
}
