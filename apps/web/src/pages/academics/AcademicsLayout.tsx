import { BookOpen, CalendarCog, CalendarDays } from 'lucide-react';
import { AreaLayout, type AreaSection } from '@/components/AreaLayout';
import { useCurrentUser } from '@/hooks/queries';
import { canEditTimetable } from './TimetablePage';

/** Everything about studying and teaching: timetable, courses, attendance, results, exams. */
export default function AcademicsLayout() {
  const me = useCurrentUser();
  const sections: AreaSection[] = [
    { to: '/academics/timetable', label: 'Timetable', icon: CalendarDays, end: true },
    { to: '/academics/courses', label: 'Courses', icon: BookOpen },
  ];
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
      footer="Timetable changes reach everyone affected immediately."
    />
  );
}
