/** Offices and facilities for the demo campus map, with the hours they usually keep. */
import type { Office } from '@cui/shared';
import { CampusPlace } from '../models';

const WEEKDAYS = [1, 2, 3, 4, 5];
const office = (open: string, close: string) => [{ days: WEEKDAYS, open, close }];

const PLACES: {
  name: string;
  kind: 'office' | 'facility';
  block: string;
  floor: number | null;
  description: string;
  office?: Office;
  hours: { days: number[]; open: string; close: string }[];
}[] = [
  {
    name: "Director's Office",
    kind: 'office',
    block: 'Administration Block',
    floor: 1,
    description: 'Campus notices, letters and the academic calendar.',
    office: 'DIRECTOR',
    hours: office('08:30', '16:30'),
  },
  {
    name: 'Accounts Office',
    kind: 'office',
    block: 'Administration Block',
    floor: 0,
    description: 'Fee challans, payments and refunds. Bring the student copy of your challan.',
    office: 'ACCOUNTS',
    hours: office('09:00', '15:00'),
  },
  {
    name: 'IT Services Help Desk',
    kind: 'facility',
    block: 'Administration Block',
    floor: 0,
    description: 'Accounts, Wi-Fi, CUI Connect and lab computers.',
    hours: [{ days: [1, 2, 3, 4, 5, 6], open: '08:00', close: '17:00' }],
  },
  {
    name: 'Transport Office',
    kind: 'facility',
    block: 'Administration Block',
    floor: 0,
    description: 'Bus cards, routes and timings.',
    hours: office('08:00', '16:00'),
  },
  {
    name: 'Examination Office',
    kind: 'office',
    block: 'Examination Centre',
    floor: 0,
    description: 'Date sheets, seating, transcripts and bonafide letters.',
    office: 'EXAM',
    hours: office('09:00', '16:00'),
  },
  {
    name: 'Department of Computer Science Office',
    kind: 'office',
    block: 'Academic Block II',
    floor: 2,
    description: 'Timetables, course offers and department letters.',
    office: 'DEPARTMENT',
    hours: office('08:30', '16:30'),
  },
  {
    name: 'Student Affairs',
    kind: 'office',
    block: 'Student Service Centre',
    floor: 0,
    description: 'ID cards, complaints, societies, events and lost & found.',
    office: 'STUDENT_AFFAIRS',
    hours: [
      { days: WEEKDAYS, open: '08:30', close: '16:30' },
      { days: [6], open: '09:00', close: '13:00' },
    ],
  },
  {
    name: 'Medical Centre',
    kind: 'facility',
    block: 'Student Service Centre',
    floor: 1,
    description: 'A doctor and a nurse on duty; first aid and referrals.',
    hours: office('08:30', '16:30'),
  },
  {
    name: 'Cafeteria',
    kind: 'facility',
    block: 'Student Service Centre',
    floor: 0,
    description: 'Breakfast, lunch and tea.',
    hours: [{ days: [1, 2, 3, 4, 5, 6], open: '08:00', close: '19:00' }],
  },
  {
    name: 'Central Library',
    kind: 'facility',
    block: 'Library',
    floor: null,
    description: 'Books, journals, quiet study halls and group discussion rooms.',
    hours: [
      { days: WEEKDAYS, open: '08:00', close: '20:00' },
      { days: [6], open: '09:00', close: '17:00' },
    ],
  },
  {
    name: 'University Masjid',
    kind: 'facility',
    block: 'Masjid',
    floor: null,
    description: 'Open for every prayer; wudu area on the ground floor.',
    hours: [{ days: [1, 2, 3, 4, 5, 6, 7], open: '05:00', close: '22:00' }],
  },
  {
    name: 'Sports Complex',
    kind: 'facility',
    block: 'Sports Complex',
    floor: null,
    description: 'Gym, badminton and table tennis courts; cricket and football grounds outside.',
    hours: [{ days: [1, 2, 3, 4, 5, 6], open: '07:00', close: '19:00' }],
  },
];

export async function seedPlaces(): Promise<number> {
  await CampusPlace.insertMany(PLACES.map((p) => ({ ...p, office: p.office ?? null })));
  return PLACES.length;
}
