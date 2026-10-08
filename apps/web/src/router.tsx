import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router';
import { AppRail } from '@/components/AppRail';
import { Spinner } from '@/components/feedback';
import { QuickSwitcher, useSwitcherShortcut } from '@/components/QuickSwitcher';
import { useMe } from '@/hooks/queries';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { ChatHome } from '@/pages/chat/ChatHome';
import { ChatLayout } from '@/pages/chat/ChatLayout';
import { ChatView } from '@/pages/chat/ChatView';
import { DiscoverDialog, NewMessageDialog } from '@/pages/chat/dialogs';
import { LoginPage } from '@/pages/LoginPage';
import { useRealtime } from '@/state/realtime';
import { useUi } from '@/state/ui';

const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout'));
const OverviewPage = lazy(() => import('@/pages/admin/OverviewPage'));
const UsersPage = lazy(() => import('@/pages/admin/UsersPage'));
const StructurePage = lazy(() => import('@/pages/admin/StructurePage'));
const GroupsPage = lazy(() => import('@/pages/admin/GroupsPage'));
const AuditPage = lazy(() => import('@/pages/admin/AuditPage'));

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
      <div className="flex min-w-0 flex-1">
        <Suspense fallback={<FullScreenSpinner />}>
          <Outlet />
        </Suspense>
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
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <AuthedShell />;
}

function RequireAdmin() {
  const { data: me } = useMe();
  if (me?.role !== 'admin') return <Navigate to="/chat" replace />;
  return <AdminLayout />;
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: <Navigate to="/chat" replace /> },
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
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/chat" replace /> },
]);
