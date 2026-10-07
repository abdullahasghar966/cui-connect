/**
 * Demo data modelled on COMSATS University Islamabad. People are fictional; the structure
 * (departments, sections like BCS-7A, registration numbers like FA23-BCS-001, offices,
 * HODs, batch advisors and CRs) mirrors how the campus actually communicates.
 */
import type { Office, Role } from '@cui/shared';

/** Shared password for every demo account (documented in the README). */
export const DEMO_PASSWORD = 'Comsats@2026';

export interface DemoAccount {
  label: string;
  identifier: string;
  role: Role;
  note: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    label: 'IT Services Admin',
    identifier: 'admin@comsats.edu.pk',
    role: 'admin',
    note: 'Manages users, structure and groups; sees the live audit feed',
  },
  {
    label: "Director's Office",
    identifier: 'director.office@comsats.edu.pk',
    role: 'staff',
    note: 'Posts campus-wide announcements',
  },
  {
    label: 'Dr. Ayesha Siddiqui (HOD CS)',
    identifier: 'ayesha.siddiqui@comsats.edu.pk',
    role: 'faculty',
    note: 'Posts CS notices; owns the CS faculty lounge and CR council',
  },
  {
    label: 'Dr. Imran Haider',
    identifier: 'imran.haider@comsats.edu.pk',
    role: 'faculty',
    note: 'Teaches AWT to BCS-7A and is its batch advisor',
  },
  {
    label: 'Ali Raza (BCS-7A, CR)',
    identifier: 'FA23-BCS-001',
    role: 'student',
    note: 'Class representative: also in the CR council',
  },
  {
    label: 'Hira Khan (BCS-7A)',
    identifier: 'FA23-BCS-002',
    role: 'student',
    note: 'Regular student: read-only in announcement channels',
  },
  {
    label: 'Usman Tariq (BCS-7B, CR)',
    identifier: 'FA23-BCS-031',
    role: 'student',
    note: 'Different section: cannot see BCS-7A conversations',
  },
  {
    label: 'Examination Office',
    identifier: 'exam.office@comsats.edu.pk',
    role: 'staff',
    note: 'Offices can message anyone; posts in the Exam Coordination Cell',
  },
];

export const DEPARTMENTS = [
  { code: 'CS', name: 'Department of Computer Science' },
  { code: 'EE', name: 'Department of Electrical & Computer Engineering' },
  { code: 'MS', name: 'Department of Management Sciences' },
] as const;

export type DeptCode = (typeof DEPARTMENTS)[number]['code'];

export interface SeedStaff {
  key: string;
  name: string;
  email: string;
  role: 'admin' | 'staff';
  office?: Office;
  dept?: DeptCode;
  designation: string;
}

export const STAFF: SeedStaff[] = [
  {
    key: 'admin',
    name: 'IT Services Admin',
    email: 'admin@comsats.edu.pk',
    role: 'admin',
    designation: 'System Administrator, IT Services',
  },
  {
    key: 'director',
    name: 'Kamran Akhtar',
    email: 'director.office@comsats.edu.pk',
    role: 'staff',
    office: 'DIRECTOR',
    designation: "Deputy Registrar, Director's Office",
  },
  {
    key: 'exam',
    name: 'Sadia Rehman',
    email: 'exam.office@comsats.edu.pk',
    role: 'staff',
    office: 'EXAM',
    designation: 'Examination Office',
  },
  {
    key: 'affairs',
    name: 'Usman Ghani',
    email: 'student.affairs@comsats.edu.pk',
    role: 'staff',
    office: 'STUDENT_AFFAIRS',
    designation: 'Student Affairs Officer',
  },
  {
    key: 'csOffice',
    name: 'Bilal Ahmed',
    email: 'cs.office@comsats.edu.pk',
    role: 'staff',
    office: 'DEPARTMENT',
    dept: 'CS',
    designation: 'CS Department Coordinator',
  },
];

export interface SeedFaculty {
  key: string;
  name: string;
  email: string;
  dept: DeptCode;
  designation: string;
  isHOD?: boolean;
}

export const FACULTY: SeedFaculty[] = [
  {
    key: 'ayesha',
    name: 'Dr. Ayesha Siddiqui',
    email: 'ayesha.siddiqui@comsats.edu.pk',
    dept: 'CS',
    designation: 'Professor & Head of Department',
    isHOD: true,
  },
  {
    key: 'imran',
    name: 'Dr. Imran Haider',
    email: 'imran.haider@comsats.edu.pk',
    dept: 'CS',
    designation: 'Associate Professor',
  },
  {
    key: 'fatima',
    name: 'Ms. Fatima Noor',
    email: 'fatima.noor@comsats.edu.pk',
    dept: 'CS',
    designation: 'Lecturer',
  },
  {
    key: 'naveed',
    name: 'Dr. Naveed Anwar',
    email: 'naveed.anwar@comsats.edu.pk',
    dept: 'CS',
    designation: 'Assistant Professor',
  },
  {
    key: 'hamza',
    name: 'Mr. Hamza Tariq',
    email: 'hamza.tariq@comsats.edu.pk',
    dept: 'CS',
    designation: 'Lecturer',
  },
  {
    key: 'tariq',
    name: 'Dr. Tariq Mahmood',
    email: 'tariq.mahmood@comsats.edu.pk',
    dept: 'EE',
    designation: 'Professor & Head of Department',
    isHOD: true,
  },
  {
    key: 'sana',
    name: 'Dr. Sana Javed',
    email: 'sana.javed@comsats.edu.pk',
    dept: 'EE',
    designation: 'Assistant Professor',
  },
  {
    key: 'rabia',
    name: 'Dr. Rabia Aslam',
    email: 'rabia.aslam@comsats.edu.pk',
    dept: 'MS',
    designation: 'Associate Professor & Head of Department',
    isHOD: true,
  },
];

export interface SeedSection {
  name: string;
  program: string;
  intake: string;
  dept: DeptCode;
  advisor: string;
  /** First registration serial for the section, e.g. 31 → FA23-BCS-031. */
  firstSerial: number;
  students: string[];
}

export const SECTIONS: SeedSection[] = [
  {
    name: 'BCS-7A',
    program: 'BCS',
    intake: 'FA23',
    dept: 'CS',
    advisor: 'imran',
    firstSerial: 1,
    students: [
      'Ali Raza',
      'Hira Khan',
      'Ahmed Nawaz',
      'Zainab Malik',
      'Hassan Javed',
      'Maryam Shah',
    ],
  },
  {
    name: 'BCS-7B',
    program: 'BCS',
    intake: 'FA23',
    dept: 'CS',
    advisor: 'fatima',
    firstSerial: 31,
    students: [
      'Usman Tariq',
      'Ayesha Farooq',
      'Bilal Qureshi',
      'Sana Iqbal',
      'Hamza Ali',
      'Noor Fatima',
    ],
  },
  {
    name: 'BSE-5A',
    program: 'BSE',
    intake: 'FA24',
    dept: 'CS',
    advisor: 'hamza',
    firstSerial: 1,
    students: [
      'Fahad Mustafa',
      'Iqra Saleem',
      'Saad Ahmed',
      'Amna Riaz',
      'Talha Mehmood',
      'Rimsha Aslam',
    ],
  },
  {
    name: 'BEE-7A',
    program: 'BEE',
    intake: 'FA23',
    dept: 'EE',
    advisor: 'sana',
    firstSerial: 1,
    students: [
      'Danish Kamal',
      'Mehwish Akram',
      'Shahzaib Khan',
      'Laiba Hussain',
      'Umer Farooq',
      'Kiran Batool',
    ],
  },
];

export function regNoFor(section: SeedSection, index: number): string {
  return `${section.intake}-${section.program}-${String(section.firstSerial + index).padStart(3, '0')}`;
}

export interface SeedCourse {
  key: string;
  code: string;
  title: string;
  section: string;
  instructor: string;
  /** Extra students from other sections (e.g. repeaters), by registration number. */
  extraStudents?: string[];
}

export const COURSES: SeedCourse[] = [
  {
    key: 'awt7a',
    code: 'CSC337',
    title: 'Advanced Web Technologies',
    section: 'BCS-7A',
    instructor: 'imran',
  },
  {
    key: 'awt7b',
    code: 'CSC337',
    title: 'Advanced Web Technologies',
    section: 'BCS-7B',
    instructor: 'fatima',
  },
  {
    key: 'cc7a',
    code: 'CSC441',
    title: 'Compiler Construction',
    section: 'BCS-7A',
    instructor: 'naveed',
    extraStudents: ['FA23-BCS-033'],
  },
  {
    key: 'cc7b',
    code: 'CSC441',
    title: 'Compiler Construction',
    section: 'BCS-7B',
    instructor: 'naveed',
  },
  {
    key: 'se5a',
    code: 'CSC291',
    title: 'Software Engineering',
    section: 'BSE-5A',
    instructor: 'hamza',
  },
  {
    key: 'dsp7a',
    code: 'EEE351',
    title: 'Digital Signal Processing',
    section: 'BEE-7A',
    instructor: 'sana',
  },
];
