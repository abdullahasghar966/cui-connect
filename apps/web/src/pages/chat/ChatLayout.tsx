import { LoaderCircle, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Outlet, useParams } from 'react-router';
import { useGroups } from '@/hooks/queries';
import { cn } from '@/lib/utils';
import { useRealtime } from '@/state/realtime';
import { Sidebar } from './Sidebar';

/** A slim bar while the live connection is down; brief first-connect delays stay invisible. */
function ConnectionBanner() {
  const status = useRealtime((s) => s.status);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (status === 'connected') {
      setShow(false);
      return;
    }
    const timer = window.setTimeout(() => setShow(true), status === 'connecting' ? 2000 : 400);
    return () => window.clearTimeout(timer);
  }, [status]);

  if (!show || status === 'connected') return null;
  const offline = status === 'offline';
  return (
    <div
      role="status"
      className={cn(
        'flex h-8 shrink-0 items-center justify-center gap-2 text-[13px] font-medium',
        offline ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning',
      )}
    >
      {offline ? (
        <WifiOff className="size-3.5" aria-hidden />
      ) : (
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
      )}
      {offline
        ? 'You are offline.'
        : 'Reconnecting… new messages will appear as soon as you are back.'}
    </div>
  );
}

export function ChatLayout() {
  const { groupId } = useParams();
  const { data: groups } = useGroups();
  const unread = groups?.reduce((sum, g) => sum + g.unread, 0) ?? 0;

  useEffect(() => {
    document.title = unread ? `(${unread > 99 ? '99+' : unread}) CUI Connect` : 'CUI Connect';
  }, [unread]);
  // Leaving the chat (sign-out, admin console) must not keep showing a stale unread count.
  useEffect(
    () => () => {
      document.title = 'CUI Connect';
    },
    [],
  );

  return (
    <div className="flex h-full min-w-0 flex-1 overflow-hidden">
      <Sidebar
        activeGroupId={groupId}
        className={cn('w-full md:w-[264px] md:shrink-0', groupId ? 'hidden md:flex' : 'flex')}
      />
      <main
        className={cn('min-w-0 flex-1 flex-col bg-background', groupId ? 'flex' : 'hidden md:flex')}
      >
        <ConnectionBanner />
        <Outlet />
      </main>
    </div>
  );
}
