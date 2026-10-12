/**
 * Campus events for the demo, dated around today so there is always something coming up: a
 * seminar by Dr. Imran Haider (approved by Student Affairs), the career fair, a programming
 * contest with one place left, the cricket final, a qawwali night, two past events, and Ali's
 * class dinner waiting for Student Affairs. Hira hasn't answered any (the demo).
 */
import { addDays, campusClock, type EventCategory, type RsvpStatus } from '@cui/shared';
import type { Types } from 'mongoose';
import { CampusEvent, EventRsvp, User, type UserDoc } from '../models';

interface SeedEvent {
  title: string;
  description: string;
  category: EventCategory;
  day: number;
  start: string;
  end: string;
  venue: string;
  organiser: string;
  capacity?: number;
  by: 'affairs' | 'imran' | 'csOffice' | 'ali';
  status?: 'published' | 'pending';
  going?: number;
  interested?: number;
}

const EVENTS: SeedEvent[] = [
  {
    title: 'Seminar: Real-time Web Apps with WebSockets',
    description:
      'How chat, live dashboards and multiplayer games stay in sync: WebSockets, Socket.IO rooms and namespaces, acknowledgements and scaling with an adapter. Bring a laptop for the short demo.',
    category: 'seminar',
    day: 3,
    start: '14:00',
    end: '15:30',
    venue: 'Seminar Hall, Academic Block II',
    organiser: 'Department of Computer Science',
    capacity: 60,
    by: 'imran',
    going: 9,
    interested: 4,
  },
  {
    title: 'Inter-department Cricket Final: CS vs EE',
    description:
      'The final of the inter-department cricket cup. Come and support your department; refreshments at the ground.',
    category: 'sports',
    day: 5,
    start: '15:00',
    end: '18:00',
    venue: 'University Cricket Ground',
    organiser: 'Sports Society',
    by: 'affairs',
    going: 8,
    interested: 6,
  },
  {
    title: 'ACM Speed Programming Contest',
    description:
      'Three hours, teams of one, ten problems from easy to hard. C++, Java and Python are allowed. Places are limited by the lab size.',
    category: 'competition',
    day: 6,
    start: '09:00',
    end: '12:00',
    venue: 'Lab B-201',
    organiser: 'ACM Student Chapter',
    capacity: 12,
    by: 'csOffice',
    going: 11,
    interested: 3,
  },
  {
    title: 'Career Fair 2026',
    description:
      'More than 30 software houses, banks and telecom companies hiring for internships and graduate roles. Bring printed CVs; the career office reviews CVs at its stall.',
    category: 'career',
    day: 9,
    start: '10:00',
    end: '16:00',
    venue: 'Main Auditorium and Lawn',
    organiser: 'Student Affairs, Career Services',
    by: 'affairs',
    going: 14,
    interested: 5,
  },
  {
    title: 'Qawwali Night',
    description: 'An evening of qawwali under the stars, open to students, staff and families.',
    category: 'cultural',
    day: 16,
    start: '19:30',
    end: '22:30',
    venue: 'Open Air Theatre',
    organiser: 'Student Affairs',
    by: 'affairs',
    going: 6,
    interested: 7,
  },
  {
    title: 'BCS-7A Class Dinner',
    description:
      'A dinner for BCS-7A before the final year gets busy. Teachers of the section are invited too.',
    category: 'society',
    day: 20,
    start: '19:00',
    end: '22:00',
    venue: 'Cafeteria Lawn',
    organiser: 'BCS-7A Class',
    by: 'ali',
    status: 'pending',
  },
  {
    title: 'Blood Donation Drive',
    description: 'Donate blood with the Blood Donors Society and the Holy Family Hospital team.',
    category: 'other',
    day: -12,
    start: '09:00',
    end: '15:00',
    venue: 'Student Service Centre',
    organiser: 'Blood Donors Society',
    by: 'affairs',
    going: 10,
  },
  {
    title: 'Workshop: Git and GitHub for Final Year Projects',
    description: 'Branches, pull requests and reviews for FYP teams, hands on.',
    category: 'workshop',
    day: -20,
    start: '11:30',
    end: '13:00',
    venue: 'Lab A-104',
    organiser: 'Department of Computer Science',
    capacity: 40,
    by: 'csOffice',
    going: 12,
  },
];

export async function seedEvents(today = campusClock().date): Promise<number> {
  const staff = await User.find({
    email: {
      $in: [
        'student.affairs@comsats.edu.pk',
        'imran.haider@comsats.edu.pk',
        'cs.office@comsats.edu.pk',
      ],
    },
  })
    .select('email')
    .lean<Pick<UserDoc, '_id' | 'email'>[]>();
  const ali = await User.findOne({ regNo: 'FA23-BCS-001' }).select('_id').lean();
  const byEmail = (email: string) => staff.find((s) => s.email === email)?._id;
  const creators: Record<SeedEvent['by'], Types.ObjectId | undefined> = {
    affairs: byEmail('student.affairs@comsats.edu.pk'),
    imran: byEmail('imran.haider@comsats.edu.pk'),
    csOffice: byEmail('cs.office@comsats.edu.pk'),
    ali: ali?._id,
  };
  // Everyone but Hira and Mehwish (the demo accounts answer for themselves).
  const people = await User.find({
    role: { $in: ['student', 'faculty'] },
    regNo: { $nin: ['FA23-BCS-002', 'FA23-BEE-002'] },
  })
    .sort({ regNo: 1, email: 1 })
    .select('_id')
    .lean<{ _id: Types.ObjectId }[]>();

  let count = 0;
  for (const [index, e] of EVENTS.entries()) {
    const createdById = creators[e.by];
    if (!createdById) continue;
    const going = e.going ?? 0;
    const interested = e.interested ?? 0;
    // A different slice of people for each event.
    const rotated = [...people.slice(index * 3), ...people.slice(0, index * 3)];
    const answers: { userId: Types.ObjectId; status: RsvpStatus }[] = [
      ...rotated.slice(0, going).map((p) => ({ userId: p._id, status: 'going' as const })),
      ...rotated
        .slice(going, going + interested)
        .map((p) => ({ userId: p._id, status: 'interested' as const })),
    ];
    const doc = await CampusEvent.create({
      title: e.title,
      description: e.description,
      category: e.category,
      date: addDays(today, e.day),
      start: e.start,
      end: e.end,
      venue: e.venue,
      organiser: e.organiser,
      capacity: e.capacity ?? null,
      going: answers.filter((a) => a.status === 'going').length,
      interested: answers.filter((a) => a.status === 'interested').length,
      status: e.status ?? 'published',
      createdById,
      decidedById: e.by === 'imran' ? (creators.affairs ?? null) : null,
    });
    if (answers.length) {
      await EventRsvp.insertMany(answers.map((a) => ({ ...a, eventId: doc._id })));
    }
    count++;
  }
  return count;
}
