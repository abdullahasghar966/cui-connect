import { Briefcase, CalendarHeart, Map as MapIcon, PackageSearch } from 'lucide-react';
import { Navigate } from 'react-router';
import { AreaLayout, type AreaSection } from '@/components/AreaLayout';

/** Campus life: events, jobs, lost & found and the map (transport follows). */
export default function CampusLayout() {
  const sections: AreaSection[] = [
    { to: '/campus/events', label: 'Events', icon: CalendarHeart },
    { to: '/campus/jobs', label: 'Jobs', icon: Briefcase },
    { to: '/campus/lost-found', label: 'Lost & found', icon: PackageSearch },
    { to: '/campus/map', label: 'Campus map', icon: MapIcon },
  ];
  return (
    <AreaLayout
      title="Campus"
      label="Campus sections"
      sections={sections}
      footer="Life around COMSATS Islamabad."
    />
  );
}

export function CampusIndex() {
  return <Navigate to="/campus/events" replace />;
}
