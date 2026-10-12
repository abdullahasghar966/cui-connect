import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router';
import { AppRail } from '@/components/AppRail';
import { Spinner } from '@/components/feedback';
import { MobileTabBar } from '@/components/MobileTabBar';
import { QuickSwitcher, useSwitcherShortcut } from '@/components/QuickSwitcher';
import { useMe } from '@/hooks/queries';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { ChatHome } from '@/pages/chat/ChatHome';
import { ChatLayout } from '@/pages/chat/ChatLayout';
import { ChatView } from '@/pages/chat/ChatView';
import { DiscoverDialog, NewMessageDialog } from '@/pages/chat/dialogs';
import { LoginPage } from '@/pages/LoginPage';
import { SetupPage } from '@/pages/SetupPage';
import { useRealtime } from '@/state/realtime';
import { useUi } from '@/state/ui';

const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout'));
const OverviewPage = lazy(() => import('@/pages/admin/OverviewPage'));
const UsersPage = lazy(() => import('@/pages/admin/UsersPage'));
const StructurePage = lazy(() => import('@/pages/admin/StructurePage'));
const GroupsPage = lazy(() => import('@/pages/admin/GroupsPage'));
const AuditPage = lazy(() => import('@/pages/admin/AuditPage'));
const AcademicSetupPage = lazy(() => import('@/pages/admin/AcademicSetupPage'));
const HomePage = lazy(() => import('@/pages/home/HomePage'));
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'));
const AcademicsLayout = lazy(() => import('@/pages/academics/AcademicsLayout'));
const TimetablePage = lazy(() => import('@/pages/academics/TimetablePage'));
const TimetableEditorPage = lazy(() => import('@/pages/academics/TimetableEditorPage'));
const CoursesPage = lazy(() => import('@/pages/academics/CoursesPage'));
const CoursePage = lazy(() => import('@/pages/academics/CoursePage'));
const AttendancePage = lazy(() => import('@/pages/academics/AttendancePage'));
const AttendanceSessionPage = lazy(() => import('@/pages/academics/AttendanceSessionPage'));
const AttendanceSheetPage = lazy(() => import('@/pages/academics/AttendanceSheetPage'));
const CheckInPage = lazy(() => import('@/pages/academics/CheckInPage'));
const ResultsPage = lazy(() => import('@/pages/academics/ResultsPage'));
const MarksPage = lazy(() => import('@/pages/academics/MarksPage'));
const ExamsPage = lazy(() => import('@/pages/academics/ExamsPage'));
const SeatingChartPage = lazy(() => import('@/pages/academics/SeatingChartPage'));
const RoomFinderPage = lazy(() => import('@/pages/academics/RoomFinderPage'));
const TeachersPage = lazy(() => import('@/pages/academics/TeachersPage'));
const TranscriptPage = lazy(() => import('@/pages/academics/TranscriptPage'));
const ProgressPage = lazy(() => import('@/pages/academics/ProgressPage'));
const CalendarPage = lazy(() => import('@/pages/academics/CalendarPage'));
const CourseworkPage = lazy(() => import('@/pages/academics/CourseworkPage'));
const CourseCourseworkPage = lazy(() => import('@/pages/academics/CourseCourseworkPage'));
const AssignmentPage = lazy(() => import('@/pages/academics/AssignmentPage'));
const QuizEditorPage = lazy(() => import('@/pages/academics/QuizEditorPage'));
const QuizPage = lazy(() => import('@/pages/academics/QuizPage'));
const SearchPage = lazy(() => import('@/pages/SearchPage'));
const ServicesLayout = lazy(() => import('@/pages/services/ServicesLayout'));
const ServicesIndex = lazy(() =>
  import('@/pages/services/ServicesLayout').then((m) => ({ default: m.ServicesIndex })),
);
const RequestsPage = lazy(() => import('@/pages/services/RequestsPage'));
const InboxPage = lazy(() => import('@/pages/services/InboxPage'));
const RequestPage = lazy(() => import('@/pages/services/RequestPage'));
const FeesPage = lazy(() => import('@/pages/services/FeesPage'));
const FeeDeskPage = lazy(() => import('@/pages/services/FeeDeskPage'));

function FullScreenSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner className="[&_svg]:size-6" />
    </div>
  );
}

/** Dialogs that can be opened from anywhere (rail, sidebar, menus, shortcuts). */
function GlobalDialogs() {
  const newMessageOpen = useUi((s) => s.newMessageOpen);
  const setNewMessageOpen = useUi((s) => s.setNewMessageOpen);
  const discoverOpen = useUi((s) => s.discoverOpen);
  const setDiscoverOpen = useUi((s) => s.setDiscoverOpen);
  return (
    <>
      <QuickSwitcher />
      <NewMessageDialog open={newMessageOpen} onOpenChange={setNewMessageOpen} />
      <DiscoverDialog open={discoverOpen} onOpenChange={setDiscoverOpen} />
    </>
  );
}

/** Live session: keeps the Socket.IO connection and cache in sync for every signed-in page. */
function AuthedShell() {
  useRealtimeSync();
  useSwitcherShortcut();
  const status = useRealtime((s) => s.status);
  return (
    <div className="flex h-full overflow-hidden">
      <AppRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 min-w-0 flex-1">
          <Suspense fallback={<FullScreenSpinner />}>
            <Outlet />
          </Suspense>
        </div>
        <MobileTabBar />
      </div>
      <GlobalDialogs />
      <span data-testid="connection" data-state={status} className="sr-only" aria-live="polite">
        {status === 'connected' ? 'Connected' : 'Connecting to CUI Connect'}
      </span>
    </div>
  );
}

function RequireAuth() {
  const { data: me, isPending } = useMe();
  const location = useLocation();
  if (isPending) return <FullScreenSpinner />;
  if (!me) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <AuthedShell />;
}

function RequireAdmin() {
  const { data: me } = useMe();
  if (me?.role !== 'admin') return <Navigate to="/home" replace />;
  return <AdminLayout />;
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/setup', element: <SetupPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: <Navigate to="/home" replace /> },
      { path: '/home', element: <HomePage /> },
      { path: '/notifications', element: <NotificationsPage /> },
      { path: '/attend/:sessionId', element: <CheckInPage /> },
      { path: '/search', element: <SearchPage /> },
      {
        path: '/services',
        element: <ServicesLayout />,
        children: [
          { index: true, element: <ServicesIndex /> },
          { path: 'requests', element: <RequestsPage /> },
          { path: 'complaints', element: <RequestsPage complaints /> },
          { path: 'inbox', element: <InboxPage /> },
          { path: 'requests/:requestId', element: <RequestPage /> },
          { path: 'fees', element: <FeesPage /> },
          { path: 'fee-desk', element: <FeeDeskPage /> },
        ],
      },
      {
        path: '/academics',
        element: <AcademicsLayout />,
        children: [
          { index: true, element: <Navigate to="/academics/timetable" replace /> },
          { path: 'timetable', element: <TimetablePage /> },
          { path: 'timetable/edit', element: <TimetableEditorPage /> },
          { path: 'courses', element: <CoursesPage /> },
          { path: 'courses/:code', element: <CoursePage /> },
          { path: 'attendance', element: <AttendancePage /> },
          { path: 'attendance/session/:sessionId', element: <AttendanceSessionPage /> },
          { path: 'attendance/course/:offeringId', element: <AttendanceSheetPage /> },
          { path: 'results', element: <ResultsPage /> },
          { path: 'marks/:offeringId', element: <MarksPage /> },
          { path: 'exams', element: <ExamsPage /> },
          { path: 'exams/:examId/seating', element: <SeatingChartPage /> },
          { path: 'rooms', element: <RoomFinderPage /> },
          { path: 'teachers', element: <TeachersPage /> },
          { path: 'transcript', element: <TranscriptPage /> },
          { path: 'progress', element: <ProgressPage /> },
          { path: 'calendar', element: <CalendarPage /> },
          { path: 'coursework', element: <CourseworkPage /> },
          { path: 'coursework/:offeringId', element: <CourseCourseworkPage /> },
          { path: 'assignments/:assignmentId', element: <AssignmentPage /> },
          { path: 'quizzes/new', element: <QuizEditorPage /> },
          { path: 'quizzes/:quizId', element: <QuizPage /> },
        ],
      },
      {
        path: '/chat',
        element: <ChatLayout />,
        children: [
          { index: true, element: <ChatHome /> },
          { path: ':groupId', element: <ChatView /> },
        ],
      },
      {
        path: '/admin',
        element: <RequireAdmin />,
        children: [
          { index: true, element: <OverviewPage /> },
          { path: 'users', element: <UsersPage /> },
          { path: 'structure', element: <StructurePage /> },
          { path: 'groups', element: <GroupsPage /> },
          { path: 'audit', element: <AuditPage /> },
          { path: 'academic', element: <AcademicSetupPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/home" replace /> },
]);
