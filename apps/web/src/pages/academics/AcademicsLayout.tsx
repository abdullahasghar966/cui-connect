import {
  BookOpen,
  CalendarCog,
  CalendarDays,
  ClipboardCheck,
  DoorOpen,
  FileClock,
  GraduationCap,
  NotebookPen,
  Users,
} from 'lucide-react';
import { AreaLayout, type AreaSection } from '@/components/AreaLayout';
import { useCurrentUser } from '@/hooks/queries';
import { canManageExams } from './ExamsPage';
import { canEditTimetable } from './TimetablePage';

/** Everything about studying and teaching: timetable, courses, attendance, results, exams. */
export default function AcademicsLayout() {
  const me = useCurrentUser();
  const sections: AreaSection[] = [
    { to: '/academics/timetable', label: 'Timetable', icon: CalendarDays, end: true },
    { to: '/academics/courses', label: 'Courses', icon: BookOpen },
    { to: '/academics/teachers', label: 'Teachers', icon: Users },
    { to: '/academics/rooms', label: 'Room finder', icon: DoorOpen },
  ];
  if (me.role === 'student' || me.role === 'faculty') {
    sections.push({ to: '/academics/attendance', label: 'Attendance', icon: ClipboardCheck });
    sections.push(
      me.role === 'student'
        ? { to: '/academics/results', label: 'Results', icon: GraduationCap }
        : { to: '/academics/results', label: 'Marks', icon: NotebookPen },
    );
  }
  if (me.role === 'student' || me.role === 'faculty' || canManageExams(me)) {
    sections.push({ to: '/academics/exams', label: 'Exams', icon: FileClock });
  }
  if (canEditTimetable(me)) {
    sections.push({
      to: '/academics/timetable/edit',
      label: 'Timetable editor',
      icon: CalendarCog,
    });
  }
  return (
    <AreaLayout
      title="Academics"
      label="Academics sections"
      sections={sections}
      wide
      footer="Changes reach everyone affected immediately."
    />
  );
}
