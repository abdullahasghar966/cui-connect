import { useSearchParams } from 'react-router';
import { PageHeader, Tabs } from '@/components/page';
import { CatalogSection } from './academic/CatalogSection';
import { ProgramsSection } from './academic/ProgramsSection';
import { RoomsSection } from './academic/RoomsSection';
import { TermsSection } from './academic/TermsSection';

const TABS = [
  { value: 'terms', label: 'Terms' },
  { value: 'rooms', label: 'Rooms' },
  { value: 'catalog', label: 'Course catalog' },
  { value: 'programs', label: 'Degree programmes' },
] as const;
type Tab = (typeof TABS)[number]['value'];

export default function AcademicSetupPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.value === params.get('tab'))?.value ?? 'terms') as Tab;

  return (
    <>
      <PageHeader
        title="Academic setup"
        description="Semesters, rooms, the course catalog and degree plans: the foundation for timetables, attendance, marks and exams."
      />
      <Tabs
        label="Academic setup sections"
        value={tab}
        onChange={(value) => setParams({ tab: value }, { replace: true })}
        options={[...TABS]}
      />
      {tab === 'terms' && <TermsSection />}
      {tab === 'rooms' && <RoomsSection />}
      {tab === 'catalog' && <CatalogSection />}
      {tab === 'programs' && <ProgramsSection />}
    </>
  );
}
