import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Inbox, MessageSquareWarning } from 'lucide-react';
import { Navigate } from 'react-router';
import { AreaLayout, type AreaSection } from '@/components/AreaLayout';
import { useCurrentUser } from '@/hooks/queries';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { handlesRequests, isOpen } from './requests-ui';

/** Campus services: students' requests and complaints, and the inbox of those who handle them. */
export default function ServicesLayout() {
  const me = useCurrentUser();
  const handler = handlesRequests(me);
  const inbox = useQuery({
    queryKey: keys.requests('inbox'),
    queryFn: () => api.services.requests('inbox'),
    enabled: handler,
  });
  const sections: AreaSection[] = [];
  if (me.role === 'student') {
    sections.push({ to: '/services/requests', label: 'Requests', icon: ClipboardList });
    sections.push({ to: '/services/complaints', label: 'Complaints', icon: MessageSquareWarning });
  }
  if (handler) {
    sections.push({
      to: '/services/inbox',
      label: 'Inbox',
      icon: Inbox,
      badge: inbox.data?.filter(isOpen).length || undefined,
    });
  }
  return (
    <AreaLayout
      title="Services"
      label="Services sections"
      sections={sections}
      footer="Everyone involved is told about each update."
    />
  );
}

/** `/services`: students start at their requests, everyone else at their inbox. */
export function ServicesIndex() {
  const me = useCurrentUser();
  return <Navigate to={me.role === 'student' ? '/services/requests' : '/services/inbox'} replace />;
}
