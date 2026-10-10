import { describe, expect, it } from 'vitest';
import {
  canManageCalendar,
  canManageCampus,
  canManageCatalog,
  canManageExams,
  canManageFees,
  canManageOffering,
  canManageStudentAffairs,
  canManageTimetable,
  canStudyIn,
  canViewOfferingRecords,
  canViewStudentRecord,
  type OfferingFacts,
} from './access';
import type { PolicyUser } from './policy';

const CS = 'dept-cs';
const EE = 'dept-ee';
const user = (u: Partial<PolicyUser> & Pick<PolicyUser, 'id' | 'role'>): PolicyUser => ({
  active: true,
  departmentId: CS,
  ...u,
});

const admin = user({ id: 'admin', role: 'admin', departmentId: null });
const examOffice = user({ id: 'exam', role: 'staff', office: 'EXAM', departmentId: null });
const accounts = user({ id: 'acc', role: 'staff', office: 'ACCOUNTS', departmentId: null });
const director = user({ id: 'dir', role: 'staff', office: 'DIRECTOR', departmentId: null });
const affairs = user({ id: 'sa', role: 'staff', office: 'STUDENT_AFFAIRS', departmentId: null });
const csOffice = user({ id: 'cs-office', role: 'staff', office: 'DEPARTMENT' });
const hodCS = user({ id: 'hod-cs', role: 'faculty', isHOD: true });
const hodEE = user({ id: 'hod-ee', role: 'faculty', isHOD: true, departmentId: EE });
const imran = user({ id: 'imran', role: 'faculty' });
const fatima = user({ id: 'fatima', role: 'faculty' });
const hira = user({ id: 'hira', role: 'student', sectionId: '7A' });
const usman = user({ id: 'usman', role: 'student', sectionId: '7B' });

const awt7A: OfferingFacts = {
  instructorId: 'imran',
  sectionId: '7A',
  departmentId: CS,
  studentIds: ['hira', 'ali'],
};

const allowed = (d: { allowed: boolean }) => d.allowed;

describe('course offerings', () => {
  it('only the instructor (and IT) run the course', () => {
    expect(allowed(canManageOffering(imran, awt7A))).toBe(true);
    expect(allowed(canManageOffering(admin, awt7A))).toBe(true);
    expect(allowed(canManageOffering(fatima, awt7A))).toBe(false);
    expect(allowed(canManageOffering(hodCS, awt7A))).toBe(false);
    expect(allowed(canManageOffering(hira, awt7A))).toBe(false);
    expect(allowed(canManageOffering({ ...imran, active: false }, awt7A))).toBe(false);
  });

  it('the whole class record is visible to the instructor, HOD and Exam Office', () => {
    expect(allowed(canViewOfferingRecords(imran, awt7A))).toBe(true);
    expect(allowed(canViewOfferingRecords(hodCS, awt7A))).toBe(true);
    expect(allowed(canViewOfferingRecords(examOffice, awt7A))).toBe(true);
    expect(allowed(canViewOfferingRecords(hodEE, awt7A))).toBe(false);
    expect(allowed(canViewOfferingRecords(fatima, awt7A))).toBe(false);
    expect(allowed(canViewOfferingRecords(hira, awt7A))).toBe(false);
  });

  it('only enrolled students take part', () => {
    expect(allowed(canStudyIn(hira, awt7A))).toBe(true);
    expect(canStudyIn(usman, awt7A)).toMatchObject({ allowed: false, code: 'NOT_ENROLLED' });
    expect(allowed(canStudyIn(imran, awt7A))).toBe(false);
  });
});

describe('student records', () => {
  const hiraRecord = { id: 'hira', departmentId: CS, sectionId: '7A' };

  it('are private to the student and the people responsible for them', () => {
    expect(allowed(canViewStudentRecord(hira, hiraRecord))).toBe(true);
    expect(allowed(canViewStudentRecord(usman, hiraRecord))).toBe(false);
    expect(allowed(canViewStudentRecord(admin, hiraRecord))).toBe(true);
    expect(allowed(canViewStudentRecord(examOffice, hiraRecord))).toBe(true);
    expect(allowed(canViewStudentRecord(hodCS, hiraRecord))).toBe(true);
    expect(allowed(canViewStudentRecord(hodEE, hiraRecord))).toBe(false);
    expect(allowed(canViewStudentRecord(fatima, hiraRecord))).toBe(false);
    expect(allowed(canViewStudentRecord(fatima, hiraRecord, { teachesStudent: true }))).toBe(true);
    expect(allowed(canViewStudentRecord(imran, hiraRecord, { advisesStudent: true }))).toBe(true);
    expect(allowed(canViewStudentRecord(director, hiraRecord))).toBe(false);
    expect(allowed(canViewStudentRecord(accounts, hiraRecord))).toBe(false);
  });
});

describe('offices and setup', () => {
  it('timetable: IT and the department office of that department', () => {
    expect(allowed(canManageTimetable(admin, CS))).toBe(true);
    expect(allowed(canManageTimetable(csOffice, CS))).toBe(true);
    expect(allowed(canManageTimetable(csOffice, EE))).toBe(false);
    expect(allowed(canManageTimetable(hodCS, CS))).toBe(false);
    expect(allowed(canManageTimetable(examOffice, CS))).toBe(false);
  });

  it('catalog: IT, the HOD and the department office', () => {
    expect(allowed(canManageCatalog(hodCS, CS))).toBe(true);
    expect(allowed(canManageCatalog(hodCS, EE))).toBe(false);
    expect(allowed(canManageCatalog(csOffice, CS))).toBe(true);
    expect(allowed(canManageCatalog(imran, CS))).toBe(false);
    expect(allowed(canManageCatalog(admin, null))).toBe(true);
  });

  it('each office manages its own area', () => {
    expect(allowed(canManageExams(examOffice))).toBe(true);
    expect(canManageExams(accounts)).toMatchObject({ allowed: false, code: 'OFFICE_ONLY' });
    expect(allowed(canManageFees(accounts))).toBe(true);
    expect(allowed(canManageFees(examOffice))).toBe(false);
    expect(allowed(canManageCalendar(director))).toBe(true);
    expect(allowed(canManageCalendar(hodCS))).toBe(false);
    expect(allowed(canManageStudentAffairs(affairs))).toBe(true);
    expect(allowed(canManageStudentAffairs(hira))).toBe(false);
    expect(allowed(canManageCampus(admin))).toBe(true);
    expect(allowed(canManageCampus(director))).toBe(false);
    for (const check of [canManageExams, canManageFees, canManageCalendar, canManageCampus]) {
      expect(allowed(check(admin))).toBe(true);
    }
  });
});
