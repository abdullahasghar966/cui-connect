import { useQuery } from '@tanstack/react-query';
import { Banknote, ClipboardList, Inbox, MessageSquareWarning, Wallet } from 'lucide-react';
import { Navigate } from 'react-router';
import { AreaLayout, type AreaSection } from '@/components/AreaLayout';
import { useCurrentUser } from '@/hooks/queries';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { managesFees } from '@/lib/nav';
import { handlesRequests, isOpen } from './requests-ui';

/**
 * Campus services: students' requests, complaints and fees; the inbox of those who handle
 * requests; and the fee desk of the Accounts Office.
 */
export default function ServicesLayout() {
  const me = useCurrentUser();
  const handler = handlesRequests(me);
  const student = me.role === 'student';
  const inbox = useQuery({
    queryKey: keys.requests('inbox'),
    queryFn: () => api.services.requests('inbox'),
    enabled: handler,
  });
  const fees = useQuery({ queryKey: keys.myFees, queryFn: api.services.fees, enabled: student });
  const sections: AreaSection[] = [];
  if (student) {
    sections.push({ to: '/services/requests', label: 'Requests', icon: ClipboardList });
    sections.push({ to: '/services/complaints', label: 'Complaints', icon: MessageSquareWarning });
    sections.push({
      to: '/services/fees',
      label: 'Fees',
      icon: Banknote,
      badge: fees.data?.challans.filter((c) => c.status !== 'paid').length || undefined,
    });
  }
  if (handler) {
    sections.push({
      to: '/services/inbox',
      label: 'Inbox',
      icon: Inbox,
      badge: inbox.data?.filter(isOpen).length || undefined,
    });
  }
  if (managesFees(me)) {
    sections.push({ to: '/services/fee-desk', label: 'Fee desk', icon: Wallet });
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

/** `/services`: students start at their requests, request handlers at their inbox, Accounts at the fee desk. */
export function ServicesIndex() {
  const me = useCurrentUser();
  const to =
    me.role === 'student'
      ? '/services/requests'
      : handlesRequests(me)
        ? '/services/inbox'
        : '/services/fee-desk';
  return <Navigate to={to} replace />;
}
