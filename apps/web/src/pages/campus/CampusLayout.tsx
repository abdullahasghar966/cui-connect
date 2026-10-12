import { CalendarHeart, Map as MapIcon } from 'lucide-react';
import { Navigate } from 'react-router';
import { AreaLayout, type AreaSection } from '@/components/AreaLayout';

/** Campus life: events (the map, jobs, lost & found and transport follow). */
export default function CampusLayout() {
  const sections: AreaSection[] = [
    { to: '/campus/events', label: 'Events', icon: CalendarHeart },
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
