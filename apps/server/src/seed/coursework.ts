/**
 * Coursework for the demo campus. Imran Haider's Advanced Web Technologies class (BCS-7A) uses the
 * online features: weekly materials, Assignment 1 handed in and graded (it is the "Assignment 1"
 * column of the marks sheet), Assignment 2 open now, a finished warm-up quiz, and a quiz ready to
 * run live in class.
 */
import { addDays, campusClock, campusInstant } from '@cui/shared';
import { Types } from 'mongoose';
import {
  Assessment,
  type AssessmentDoc,
  Assignment,
  type CourseOfferingDoc,
  Mark,
  type MarkDoc,
  Material,
  Quiz,
  type QuizQuestion,
  QuizResponse,
  Submission,
  type TermDoc,
  User,
} from '../models';
import { storeFile } from '../services/files';

/** Repeatable "random" numbers, so every reseed gives the same demo. */
function hash(text: string): number {
  let h = 7;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

const HOUR = 3600_000;

const note = (title: string, lines: string[]) =>
  Buffer.from(`# ${title}\n\n${lines.join('\n')}\n`, 'utf8');

const MATERIALS: {
  week: number;
  title: string;
  url?: string;
  file?: { name: string; lines: string[] };
  description?: string;
}[] = [
  {
    week: 1,
    title: 'Course outline and grading',
    file: {
      name: 'CSC337 course outline.md',
      lines: [
        'Weeks 1-4: HTTP, WebSockets, Socket.IO basics (events, acknowledgements).',
        'Weeks 5-8: rooms, namespaces, authentication, scaling.',
        'Weeks 9-16: REST APIs with Express, databases, deployment.',
        '',
        'Grading: quizzes 15, assignments 10, Sessional I 10, Sessional II 15, terminal 50.',
      ],
    },
  },
  { week: 1, title: 'Socket.IO documentation', url: 'https://socket.io/docs/v4/' },
  {
    week: 2,
    title: 'Lecture 2 notes: WebSockets vs HTTP polling',
    file: {
      name: 'Lecture 2 - WebSockets.md',
      lines: [
        'HTTP is request/response; the server cannot speak first.',
        'Long polling keeps a request open; WebSockets keep one connection open both ways.',
        'Socket.IO adds events, acknowledgements, rooms and automatic reconnection.',
      ],
    },
  },
  {
    week: 2,
    title: 'MDN: The WebSocket API',
    url: 'https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API',
  },
  {
    week: 3,
    title: 'Lecture 3 notes: rooms and namespaces',
    file: {
      name: 'Lecture 3 - Rooms and namespaces.md',
      lines: [
        'socket.join(room) puts a connection in a room; io.to(room).emit reaches only its members.',
        'socket.to(room).emit reaches everyone in the room except the sender.',
        'Namespaces (io.of("/admin")) split one server into separate channels with their own auth.',
      ],
    },
    description: 'Read before Assignment 1.',
  },
  { week: 4, title: 'Express 5 routing guide', url: 'https://expressjs.com/en/guide/routing.html' },
  {
    week: 5,
    title: 'Lecture 5 notes: acknowledgements',
    file: {
      name: 'Lecture 5 - Acknowledgements.md',
      lines: [
        'socket.emit(event, data, callback): the server calls the callback to confirm.',
        'Use emitWithAck with a timeout so a lost reply becomes an error you can show.',
      ],
    },
  },
  {
    week: 6,
    title: 'Sessional I: solution outline',
    file: {
      name: 'Sessional I - solution outline.md',
      lines: [
        'Q1 events vs messages',
        'Q2 rooms',
        'Q3 acknowledgements',
        'Q4 scaling with an adapter',
      ],
    },
  },
];

const A1_INSTRUCTIONS = `Build a real-time chat for your class with Socket.IO.

1. Two rooms: "general" and "help". Messages stay in their room.
2. Show who is typing, and confirm delivery with an acknowledgement.
3. Hand in a ZIP of your code and a one-page report (what you built, what you would improve).

Marked on: rooms (6), acknowledgements (6), code quality (4), report (4).`;

const A2_INSTRUCTIONS = `Build a REST API with Express 5 for a class notice board.

- GET /notices, POST /notices, DELETE /notices/:id (only the author).
- Validate input and return clear error messages (400, 403, 404).
- Include a short README with example requests.

Late work is accepted for two days and marked late.`;

function feedbackFor(percent: number): string {
  if (percent >= 85) return 'Excellent: rooms and acknowledgements are both handled cleanly.';
  if (percent >= 70) return 'Good work. Handle reconnects and show when a message is delivered.';
  if (percent >= 50) return 'It works, but messages leak between rooms. Check socket.to(room).';
  return 'Incomplete: the server never emits to rooms. Come to my office hours this week.';
}

const WARM_UP: QuizQuestion[] = [
  {
    id: 'q1',
    text: 'Which protocol keeps one connection open in both directions?',
    options: ['HTTP/1.1', 'WebSocket', 'FTP', 'SMTP'],
    correct: 1,
    points: 1,
    seconds: 20,
  },
  {
    id: 'q2',
    text: 'In plain HTTP, can the server send data before the client asks?',
    options: ['Yes', 'No'],
    correct: 1,
    points: 1,
    seconds: 15,
  },
  {
    id: 'q3',
    text: 'What does Socket.IO add on top of WebSockets?',
    options: ['Events and rooms', 'A database', 'CSS animations', 'Image compression'],
    correct: 0,
    points: 2,
    seconds: 30,
  },
];

const ROOMS_QUIZ: QuizQuestion[] = [
  {
    id: 'q1',
    text: 'Which call sends to everyone in a room except the sender?',
    options: ['io.emit(…)', 'socket.to(room).emit(…)', 'socket.emit(…)', 'io.of(room).emit(…)'],
    correct: 1,
    points: 2,
    seconds: 30,
  },
  {
    id: 'q2',
    text: 'How does the server confirm it received an event?',
    options: ['An acknowledgement callback', 'A second HTTP request', 'A cookie'],
    correct: 0,
    points: 1,
    seconds: 20,
  },
  {
    id: 'q3',
    text: 'A namespace like io.of("/admin") is mainly used to…',
    options: [
      'separate parts of the app with their own handlers and checks',
      'store messages in MongoDB',
      'compress packets',
    ],
    correct: 0,
    points: 1,
    seconds: 30,
  },
  {
    id: 'q4',
    text: 'Rooms are known only on the server; clients cannot list them.',
    options: ['True', 'False'],
    correct: 0,
    points: 1,
    seconds: 15,
  },
];

export async function seedCoursework(
  awt: CourseOfferingDoc,
  term: TermDoc,
  now = new Date(),
): Promise<{ assignments: number; materials: number; quizzes: number }> {
  const today = campusClock(now).date;
  const week = Math.floor((Date.parse(today) - Date.parse(term.startsOn)) / (7 * 24 * HOUR)) + 1;
  const teacher = awt.instructorId;
  const offeringId = awt._id;
  const students = await User.find({ _id: { $in: awt.studentIds } })
    .select('name regNo')
    .lean<{ _id: Types.ObjectId; name: string; regNo: string | null }[]>();
  const file = (
    name: string,
    body: Buffer,
    purpose: 'material' | 'assignment' | 'submission',
    attachedTo: Types.ObjectId,
    ownerId: Types.ObjectId = teacher,
  ) => storeFile({ name, body, ownerId, purpose, offeringId, attachedTo });

  // Materials of the weeks so far.
  let materials = 0;
  for (const m of MATERIALS.filter((x) => x.week <= week)) {
    const id = new Types.ObjectId();
    const stored = m.file
      ? await file(m.file.name, note(m.title, m.file.lines), 'material', id)
      : null;
    await Material.create({
      _id: id,
      offeringId,
      week: m.week,
      title: m.title,
      description: m.description ?? null,
      fileId: stored?._id ?? null,
      url: m.url ?? null,
      createdById: teacher,
    });
    materials++;
  }

  // Assignment 1: the marks sheet's "Assignment 1", handed in online and graded.
  let assignments = 0;
  const first = await Assessment.findOne({
    offeringId,
    type: 'assignment',
    title: 'Assignment 1',
  }).lean<AssessmentDoc>();
  if (first?.date) {
    const id = new Types.ObjectId();
    const dueAt = campusInstant(first.date, '23:59');
    const handout = await file(
      'Assignment 1 - Real-time chat.md',
      note('Assignment 1: Real-time chat', A1_INSTRUCTIONS.split('\n')),
      'assignment',
      id,
    );
    await Assignment.create({
      _id: id,
      offeringId,
      title: 'Assignment 1',
      instructions: A1_INSTRUCTIONS,
      dueAt,
      lateUntil: new Date(dueAt.getTime() + 48 * HOUR),
      total: first.total,
      attachmentIds: [handout._id],
      assessmentId: first._id,
      createdById: teacher,
    });
    const marks = await Mark.find({ assessmentId: first._id }).lean<MarkDoc[]>();
    for (const s of students) {
      const obtained = marks.find((m) => String(m.studentId) === String(s._id))?.obtained;
      if (obtained === null || obtained === undefined || !s.regNo) continue;
      // Ahmed (FA23-BCS-003) hands in late; everyone else a few hours to two days early.
      const late = s.regNo === 'FA23-BCS-003';
      const submittedAt = new Date(
        dueAt.getTime() + (late ? 5 * HOUR : -(2 + (hash(s.regNo) % 46)) * HOUR),
      );
      const submissionId = new Types.ObjectId();
      const report = await file(
        `${s.regNo} - Assignment 1 report.md`,
        note(`Assignment 1 report: ${s.name}`, [
          'Built a two-room chat with typing indicators and delivery acknowledgements.',
          'Next time: reconnect handling and message history.',
        ]),
        'submission',
        submissionId,
        s._id,
      );
      await Submission.create({
        _id: submissionId,
        assignmentId: id,
        offeringId,
        studentId: s._id,
        fileIds: [report._id],
        note: null,
        submittedAt,
        late,
        feedback: feedbackFor((obtained / first.total) * 100),
      });
    }
    assignments++;
  }

  // Assignment 2: open now, due in four days. Some have handed in; Hira hasn't yet.
  if (week >= 3) {
    const id = new Types.ObjectId();
    const dueOn = addDays(today, 4);
    const dueAt = campusInstant(dueOn, '23:59');
    const assessment = await Assessment.create({
      offeringId,
      type: 'assignment',
      title: 'Assignment 2: REST API with Express',
      total: 20,
      date: dueOn,
      createdById: teacher,
    });
    const handout = await file(
      'Assignment 2 - REST API.md',
      note('Assignment 2: REST API with Express', A2_INSTRUCTIONS.split('\n')),
      'assignment',
      id,
    );
    await Assignment.create({
      _id: id,
      offeringId,
      title: 'Assignment 2: REST API with Express',
      instructions: A2_INSTRUCTIONS,
      dueAt,
      lateUntil: new Date(dueAt.getTime() + 48 * HOUR),
      total: 20,
      attachmentIds: [handout._id],
      assessmentId: assessment._id,
      createdById: teacher,
    });
    for (const s of students) {
      if (!s.regNo || s.regNo === 'FA23-BCS-002') continue;
      if (s.regNo !== 'FA23-BCS-001' && hash(s.regNo) % 2 === 0) continue;
      const submissionId = new Types.ObjectId();
      const readme = await file(
        `${s.regNo} - notice board API README.md`,
        note('Notice board API', ['GET /notices', 'POST /notices', 'DELETE /notices/:id']),
        'submission',
        submissionId,
        s._id,
      );
      await Submission.create({
        _id: submissionId,
        assignmentId: id,
        offeringId,
        studentId: s._id,
        fileIds: [readme._id],
        note: 'The code is on GitHub; the README has example requests.',
        submittedAt: new Date(now.getTime() - (1 + (hash(s.regNo) % 30)) * HOUR),
        late: false,
      });
    }
    assignments++;
  }

  // A warm-up quiz from week 2 (finished), and one ready to run live.
  let quizzes = 0;
  const warmUpAt = campusInstant(addDays(term.startsOn, 8), '08:35');
  if (warmUpAt < now) {
    const quiz = await Quiz.create({
      offeringId,
      title: 'Warm-up: HTTP and WebSockets',
      questions: WARM_UP,
      status: 'ended',
      current: WARM_UP.length - 1,
      revealed: true,
      startedAt: warmUpAt,
      endedAt: new Date(warmUpAt.getTime() + 6 * 60_000),
      createdById: teacher,
    });
    await QuizResponse.insertMany(
      students.flatMap((s) =>
        WARM_UP.map((q) => {
          const roll = hash(`${s.regNo}:${q.id}`);
          const correct = roll % 4 !== 0;
          return {
            quizId: quiz._id,
            questionId: q.id,
            studentId: s._id,
            choice: correct ? q.correct : (q.correct + 1) % q.options.length,
            correct,
            points: correct ? q.points : 0,
            ms: 2500 + (roll % 14_000),
          };
        }),
      ),
    );
    quizzes++;
  }
  await Quiz.create({
    offeringId,
    title: 'Quick check: Socket.IO rooms',
    questions: ROOMS_QUIZ,
    createdById: teacher,
  });
  quizzes++;
  return { assignments, materials, quizzes };
}
