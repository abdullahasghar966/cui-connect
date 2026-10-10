import { Building2, GraduationCap, Hash, LayoutDashboard, ScrollText, Users } from 'lucide-react';
import { AreaLayout, type AreaSection } from '@/components/AreaLayout';

const SECTIONS: AreaSection[] = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/structure', label: 'Structure', icon: Building2 },
  { to: '/admin/academic', label: 'Academic setup', icon: GraduationCap },
  { to: '/admin/groups', label: 'Groups & rules', icon: Hash },
  { to: '/admin/audit', label: 'Audit log', icon: ScrollText },
];

export default function AdminLayout() {
  return (
    <AreaLayout
      title="Admin console"
      label="Admin sections"
      sections={SECTIONS}
      footer="Changes here reach people who are online immediately."
    />
  );
}
