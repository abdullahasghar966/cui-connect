/**
 * Jobs and lost & found for the demo campus, dated around today. Companies are fictional and
 * their links use example.com. Hira has saved one job; Student Affairs holds a found calculator
 * that Zainab says is hers.
 */
import { addDays, campusClock, type ItemCategory, type JobKind } from '@cui/shared';
import { JobPost, LostClaim, LostItem, SavedJob, User, type UserDoc } from '../models';

const JOBS: {
  title: string;
  company: string;
  kind: JobKind;
  location: string;
  description: string;
  applyUrl?: string;
  applyEmail?: string;
  day: number;
  programs: string[];
}[] = [
  {
    title: 'Software Engineering Intern (Summer 2027)',
    company: 'Margalla Software House',
    kind: 'internship',
    location: 'Islamabad, on site',
    description:
      'Eight weeks on a product team building web and mobile apps with React, Node.js and PostgreSQL. A stipend is paid; the best interns are offered graduate roles.',
    applyUrl: 'https://careers.example.com/margalla/intern-2027',
    day: 18,
    programs: ['BCS', 'BSE'],
  },
  {
    title: 'Data Analyst Intern',
    company: 'Potohar Fintech',
    kind: 'internship',
    location: 'Remote',
    description:
      'SQL, Python and dashboards for a payments start-up. Three months, part-time hours.',
    applyUrl: 'https://jobs.example.com/potohar/data-intern',
    day: 2,
    programs: ['BCS', 'BSE'],
  },
  {
    title: 'Research Assistant: WebSockets and IoT',
    company: 'Real-time Systems Lab, Department of CS',
    kind: 'research',
    location: 'On campus',
    description:
      'Help build a live sensor dashboard with Socket.IO and MQTT. Ten hours a week alongside your final year; counts towards research experience.',
    applyEmail: 'imran.haider@comsats.edu.pk',
    day: 7,
    programs: ['BCS'],
  },
  {
    title: 'Graduate Trainee Engineer',
    company: 'Indus Telecom',
    kind: 'graduate',
    location: 'Islamabad',
    description:
      'A one-year rotation across network planning, operations and software teams for 2027 graduates.',
    applyEmail: 'careers@indus-telecom.example.com',
    day: 25,
    programs: ['BEE', 'BCS'],
  },
  {
    title: 'Peer Tutor (part-time)',
    company: 'CUI Writing Centre',
    kind: 'part-time',
    location: 'On campus',
    description: 'Help first-year students with reports and presentations, six hours a week.',
    applyEmail: 'student.affairs@comsats.edu.pk',
    day: 10,
    programs: [],
  },
  {
    title: 'Frontend Intern',
    company: 'Rawal Digital',
    kind: 'internship',
    location: 'Rawalpindi',
    description: 'A summer internship that has closed.',
    applyUrl: 'https://careers.example.com/rawal/frontend',
    day: -20,
    programs: ['BCS'],
  },
];

const ITEMS: {
  kind: 'lost' | 'found';
  title: string;
  category: ItemCategory;
  description: string;
  place: string;
  day: number;
  by: string;
  resolved?: boolean;
}[] = [
  {
    kind: 'found',
    title: 'Casio fx-991ES calculator',
    category: 'electronics',
    description: 'Left on a desk after the 8:30 class. It is at Student Affairs.',
    place: 'A-101, Academic Block I',
    day: -1,
    by: 'student.affairs@comsats.edu.pk',
  },
  {
    kind: 'found',
    title: 'Black backpack with a laptop charger',
    category: 'bags',
    description: 'Found under a table on the second floor. Handed in to Student Affairs.',
    place: 'Central Library, 2nd floor',
    day: 0,
    by: 'FA23-BCS-033',
  },
  {
    kind: 'lost',
    title: 'Blue steel water bottle',
    category: 'bottles',
    description: 'Has a COMSATS sticker on the side.',
    place: 'Cafeteria',
    day: -2,
    by: 'FA23-BCS-003',
  },
  {
    kind: 'lost',
    title: 'Student ID card',
    category: 'cards',
    description: 'Lost somewhere between the bus stop and Academic Block II.',
    place: 'Near Academic Block II',
    day: -3,
    by: 'FA23-BCS-031',
  },
  {
    kind: 'found',
    title: 'Black umbrella',
    category: 'other',
    description: 'Found at the shoe racks.',
    place: 'University Masjid',
    day: -10,
    by: 'student.affairs@comsats.edu.pk',
    resolved: true,
  },
];

export async function seedCampusLife(today = campusClock().date): Promise<number> {
  const people = await User.find({
    $or: [
      { email: { $in: ['student.affairs@comsats.edu.pk'] } },
      {
        regNo: {
          $in: [
            'FA23-BCS-001',
            'FA23-BCS-002',
            'FA23-BCS-003',
            'FA23-BCS-004',
            'FA23-BCS-031',
            'FA23-BCS-033',
          ],
        },
      },
    ],
  })
    .select('email regNo')
    .lean<Pick<UserDoc, '_id' | 'email' | 'regNo'>[]>();
  const by = (key: string) => people.find((p) => p.email === key || p.regNo === key)?._id;
  const affairs = by('student.affairs@comsats.edu.pk');
  if (!affairs) return 0;

  const jobs = await JobPost.insertMany(
    JOBS.map((j) => ({
      ...j,
      applyUrl: j.applyUrl ?? null,
      applyEmail: j.applyEmail ?? null,
      deadline: addDays(today, j.day),
      postedById: affairs,
    })),
  );
  const hira = by('FA23-BCS-002');
  const margalla = jobs.find((j) => j.company === 'Margalla Software House');
  if (hira && margalla) await SavedJob.create({ userId: hira, jobId: margalla._id });

  for (const item of ITEMS) {
    const reporterId = by(item.by);
    if (!reporterId) continue;
    const doc = await LostItem.create({
      kind: item.kind,
      title: item.title,
      category: item.category,
      description: item.description,
      place: item.place,
      date: addDays(today, item.day),
      reporterId,
      resolvedAt: item.resolved ? new Date() : null,
      resolvedById: item.resolved ? affairs : null,
    });
    const claimant = item.title.startsWith('Casio')
      ? by('FA23-BCS-004')
      : item.resolved
        ? by('FA23-BCS-001')
        : null;
    if (claimant) {
      await LostClaim.create({
        itemId: doc._id,
        userId: claimant,
        message: item.resolved
          ? 'It is mine, it has a broken handle clip.'
          : 'Mine has the initials Z.M. scratched on the back cover.',
        accepted: !!item.resolved,
      });
    }
  }
  return JOBS.length + ITEMS.length;
}
