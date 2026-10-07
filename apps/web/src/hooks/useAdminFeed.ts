import type { AuditDTO, LiveStatsDTO } from '@cui/shared';
import { useEffect, useState } from 'react';
import { connectAdminSocket } from '@/lib/socket';

/** Subscribes to the `/admin` namespace: live stats every few seconds and new audit entries. */
export function useAdminFeed(onAudit?: (entry: AuditDTO) => void) {
  const [stats, setStats] = useState<LiveStatsDTO | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = connectAdminSocket();
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('stats', setStats);
    if (onAudit) socket.on('audit:new', onAudit);
    return () => {
      socket.disconnect();
      socket.removeAllListeners();
    };
  }, [onAudit]);

  return { stats, connected };
}
