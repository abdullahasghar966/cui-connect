import { BellRing, IdCard, UserRound } from 'lucide-react';
import { AreaLayout, type AreaSection } from '@/components/AreaLayout';

/** The viewer's own corner: profile, ID card and notification settings. */
export default function MeLayout() {
  const sections: AreaSection[] = [
    { to: '/me', label: 'Profile', icon: UserRound, end: true },
    { to: '/me/id-card', label: 'ID card', icon: IdCard },
    { to: '/me/notifications', label: 'Notifications', icon: BellRing },
  ];
  return (
    <AreaLayout
      title="You"
      label="Your account"
      sections={sections}
      footer="Your details come from the university's records."
    />
  );
}
