/**
 * Demo academic data: terms, rooms, the course catalog and degree plans. Course codes and
 * titles follow the usual shape of a COMSATS BS programme; they are illustrative, not an
 * official scheme of studies.
 */
import type { RoomKind } from '@cui/shared';
import type { DeptCode } from './data';

/** Past terms first; the last one is current. BCS-7A (intake FA23) is in its 7th semester. */
export const SEED_TERMS = ['FA23', 'SP24', 'FA24', 'SP25', 'FA25', 'SP26', 'FA26'] as const;
export const SEED_CURRENT_TERM = 'FA26';

export interface SeedRoom {
  name: string;
  block: string;
  floor: number | null;
  kind: RoomKind;
  capacity: number;
  examRows?: number;
  examCols?: number;
}

export const ROOMS: SeedRoom[] = [
  ...['A-101', 'A-102', 'A-103', 'A-104'].map((name, i) => ({
    name,
    block: 'Academic Block I',
    floor: 1,
    kind: 'classroom' as const,
    capacity: 50,
    examRows: i < 2 ? 6 : 0,
    examCols: i < 2 ? 6 : 0,
  })),
  ...['B-201', 'B-202'].map((name) => ({
    name,
    block: 'Academic Block II',
    floor: 2,
    kind: 'classroom' as const,
    capacity: 45,
  })),
  ...[1, 2, 3, 4, 5].map((n) => ({
    name: `Lab ${n}`,
    block: 'Academic Block II',
    floor: n <= 2 ? 0 : 1,
    kind: 'lab' as const,
    capacity: 40,
  })),
  {
    name: 'Exam Hall A',
    block: 'Examination Centre',
    floor: 0,
    kind: 'hall',
    capacity: 80,
    examRows: 10,
    examCols: 8,
  },
  {
    name: 'Exam Hall B',
    block: 'Examination Centre',
    floor: 0,
    kind: 'hall',
    capacity: 64,
    examRows: 8,
    examCols: 8,
  },
];

export interface SeedCatalogCourse {
  code: string;
  title: string;
  dept: DeptCode;
  credits: number;
  lab?: number;
  prerequisites?: string[];
  description?: string;
  clos?: string[];
  outline?: string[];
}

export const CATALOG: SeedCatalogCourse[] = [
  // Semester 1
  { code: 'CSC101', title: 'Introduction to ICT', dept: 'CS', credits: 3, lab: 1 },
  { code: 'CSC103', title: 'Programming Fundamentals', dept: 'CS', credits: 4, lab: 1 },
  { code: 'MTH104', title: 'Calculus and Analytical Geometry', dept: 'CS', credits: 3 },
  { code: 'HUM100', title: 'English Comprehension and Composition', dept: 'MS', credits: 3 },
  { code: 'HUM110', title: 'Islamic Studies', dept: 'MS', credits: 3 },
  { code: 'PHY121', title: 'Applied Physics', dept: 'EE', credits: 3, lab: 1 },
  // Semester 2
  {
    code: 'CSC241',
    title: 'Object Oriented Programming',
    dept: 'CS',
    credits: 4,
    lab: 1,
    prerequisites: ['CSC103'],
  },
  { code: 'CSC102', title: 'Discrete Structures', dept: 'CS', credits: 3 },
  {
    code: 'MTH105',
    title: 'Multivariable Calculus',
    dept: 'CS',
    credits: 3,
    prerequisites: ['MTH104'],
  },
  { code: 'HUM103', title: 'Communication Skills', dept: 'MS', credits: 3 },
  { code: 'EEE241', title: 'Digital Logic Design', dept: 'EE', credits: 3, lab: 1 },
  // Semester 3
  {
    code: 'CSC211',
    title: 'Data Structures and Algorithms',
    dept: 'CS',
    credits: 4,
    lab: 1,
    prerequisites: ['CSC241'],
  },
  { code: 'MTH231', title: 'Linear Algebra', dept: 'CS', credits: 3 },
  { code: 'CSC270', title: 'Database Systems I', dept: 'CS', credits: 4, lab: 1 },
  { code: 'MTH262', title: 'Probability and Statistics', dept: 'CS', credits: 3 },
  { code: 'HUM111', title: 'Pakistan Studies', dept: 'MS', credits: 2 },
  // Semester 4
  {
    code: 'CSC301',
    title: 'Design and Analysis of Algorithms',
    dept: 'CS',
    credits: 3,
    prerequisites: ['CSC211'],
  },
  {
    code: 'CSC322',
    title: 'Operating Systems',
    dept: 'CS',
    credits: 4,
    lab: 1,
    prerequisites: ['CSC211'],
  },
  { code: 'CSC339', title: 'Data Communication and Networking', dept: 'CS', credits: 4, lab: 1 },
  { code: 'CSC291', title: 'Software Engineering', dept: 'CS', credits: 3 },
  { code: 'MTH375', title: 'Numerical Computing', dept: 'CS', credits: 3 },
  // Semester 5
  {
    code: 'CSC462',
    title: 'Artificial Intelligence',
    dept: 'CS',
    credits: 4,
    lab: 1,
    prerequisites: ['CSC211'],
  },
  {
    code: 'CSC336',
    title: 'Web Technologies',
    dept: 'CS',
    credits: 3,
    lab: 1,
    prerequisites: ['CSC241'],
  },
  {
    code: 'CSC312',
    title: 'Theory of Automata',
    dept: 'CS',
    credits: 3,
    prerequisites: ['CSC102'],
  },
  { code: 'HUM300', title: 'Technical and Business Writing', dept: 'MS', credits: 3 },
  {
    code: 'CSC271',
    title: 'Database Systems II',
    dept: 'CS',
    credits: 3,
    lab: 1,
    prerequisites: ['CSC270'],
  },
  // Semester 6
  { code: 'CSC440', title: 'Information Security', dept: 'CS', credits: 3, lab: 1 },
  { code: 'CSC356', title: 'Human Computer Interaction', dept: 'CS', credits: 3 },
  {
    code: 'CSC334',
    title: 'Parallel and Distributed Computing',
    dept: 'CS',
    credits: 3,
    lab: 1,
    prerequisites: ['CSC322'],
  },
  { code: 'CSC303', title: 'Mobile Application Development', dept: 'CS', credits: 3, lab: 1 },
  { code: 'MGT350', title: 'Entrepreneurship', dept: 'MS', credits: 3 },
  // Semester 7
  {
    code: 'CSC337',
    title: 'Advanced Web Technologies',
    dept: 'CS',
    credits: 3,
    lab: 1,
    prerequisites: ['CSC336'],
    description:
      'Modern full-stack web development: TypeScript, React, REST APIs, real-time communication with WebSockets and Socket.IO, authentication and security, testing and deployment.',
    clos: [
      'Build interactive client applications with a modern component framework.',
      'Design REST APIs and real-time event protocols with acknowledgements.',
      'Apply authentication, authorization and common web security defences.',
      'Test and deploy a production web application.',
    ],
    outline: [
      'TypeScript and the modern JavaScript toolchain',
      'React components, state and data fetching',
      'Node.js, Express and REST API design',
      'MongoDB and data modelling',
      'Authentication: sessions, cookies and JWT',
      'WebSockets and Socket.IO: events and acknowledgements',
      'Socket.IO rooms and namespaces',
      'Sessional I',
      'Authorization and web security (OWASP)',
      'Testing: unit, integration and end-to-end',
      'Performance and caching',
      'Deployment and CI',
      'Sessional II',
      'Scaling real-time systems',
      'Project presentations',
      'Revision',
    ],
  },
  {
    code: 'CSC441',
    title: 'Compiler Construction',
    dept: 'CS',
    credits: 3,
    prerequisites: ['CSC312'],
    description:
      'Lexical analysis, parsing, semantic analysis, intermediate code generation and optimisation, with a term-long compiler project.',
  },
  {
    code: 'CSC498',
    title: 'Final Year Project I',
    dept: 'CS',
    credits: 3,
    lab: 3,
    description:
      'Proposal, requirements and design of the final year project, defended before a committee.',
  },
  { code: 'CSC455', title: 'Cloud Computing', dept: 'CS', credits: 3, lab: 1 },
  { code: 'CSC491', title: 'Professional Practices', dept: 'CS', credits: 3 },
  // Semester 8
  {
    code: 'CSC499',
    title: 'Final Year Project II',
    dept: 'CS',
    credits: 3,
    lab: 3,
    prerequisites: ['CSC498'],
  },
  { code: 'CSC475', title: 'Software Project Management', dept: 'CS', credits: 3 },
  {
    code: 'CSC460',
    title: 'Machine Learning',
    dept: 'CS',
    credits: 3,
    lab: 1,
    prerequisites: ['CSC462'],
  },
  // Electrical engineering
  { code: 'EEE121', title: 'Circuit Analysis I', dept: 'EE', credits: 4, lab: 1 },
  { code: 'EEE223', title: 'Signals and Systems', dept: 'EE', credits: 3 },
  { code: 'EEE342', title: 'Control Systems', dept: 'EE', credits: 4, lab: 1 },
  {
    code: 'EEE351',
    title: 'Digital Signal Processing',
    dept: 'EE',
    credits: 4,
    lab: 1,
    prerequisites: ['EEE223'],
  },
  { code: 'EEE461', title: 'Power Electronics', dept: 'EE', credits: 4, lab: 1 },
];

export interface SeedProgram {
  code: string;
  name: string;
  dept: DeptCode;
  totalCredits: number;
  plan: string[][];
}

export const PROGRAMS: SeedProgram[] = [
  {
    code: 'BCS',
    name: 'BS Computer Science',
    dept: 'CS',
    totalCredits: 133,
    plan: [
      ['CSC101', 'CSC103', 'MTH104', 'HUM100', 'HUM110', 'PHY121'],
      ['CSC241', 'CSC102', 'MTH105', 'HUM103', 'EEE241'],
      ['CSC211', 'MTH231', 'CSC270', 'MTH262', 'HUM111'],
      ['CSC301', 'CSC322', 'CSC339', 'CSC291', 'MTH375'],
      ['CSC462', 'CSC336', 'CSC312', 'HUM300', 'CSC271'],
      ['CSC440', 'CSC356', 'CSC334', 'CSC303', 'MGT350'],
      ['CSC337', 'CSC441', 'CSC498', 'CSC455', 'CSC491'],
      ['CSC499', 'CSC475', 'CSC460'],
    ],
  },
  {
    code: 'BSE',
    name: 'BS Software Engineering',
    dept: 'CS',
    totalCredits: 130,
    plan: [
      ['CSC101', 'CSC103', 'MTH104', 'HUM100', 'HUM110'],
      ['CSC241', 'CSC102', 'HUM103', 'EEE241'],
      ['CSC211', 'CSC270', 'MTH262', 'HUM111'],
      ['CSC301', 'CSC322', 'CSC339', 'MTH231'],
      ['CSC291', 'CSC336', 'CSC462', 'HUM300'],
      ['CSC356', 'CSC440', 'CSC303', 'MGT350'],
      ['CSC475', 'CSC498', 'CSC455'],
      ['CSC499', 'CSC491'],
    ],
  },
  {
    code: 'BEE',
    name: 'BS Electrical Engineering',
    dept: 'EE',
    totalCredits: 136,
    plan: [
      ['EEE121', 'PHY121', 'MTH104', 'HUM100', 'CSC101'],
      ['EEE241', 'MTH105', 'HUM103', 'CSC103'],
      ['EEE223', 'MTH231', 'HUM110'],
      ['MTH262', 'HUM111'],
      ['EEE342'],
      ['MGT350'],
      ['EEE351', 'EEE461'],
      [],
    ],
  },
];
