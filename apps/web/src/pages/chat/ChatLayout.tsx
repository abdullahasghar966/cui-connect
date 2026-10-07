import { useEffect } from 'react';
import { Outlet, useParams } from 'react-router';
import { useGroups } from '@/hooks/queries';
import { cn } from '@/lib/utils';
import { Sidebar } from './Sidebar';

export function ChatLayout() {
  const { groupId } = useParams();
  const { data: groups } = useGroups();
  const unread = groups?.reduce((sum, g) => sum + g.unread, 0) ?? 0;

  useEffect(() => {
    document.title = unread ? `(${unread > 99 ? '99+' : unread}) CUI Connect` : 'CUI Connect';
  }, [unread]);

  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar
        activeGroupId={groupId}
        className={cn('w-full md:w-80 md:shrink-0', groupId ? 'hidden md:flex' : 'flex')}
      />
      <main className={cn('min-w-0 flex-1', groupId ? 'flex' : 'hidden md:flex')}>
        <Outlet />
      </main>
    </div>
  );
}
