import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { closeSocket } from '@/lib/socket';
import { useRealtime } from '@/state/realtime';

export function useSignOut() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useCallback(async () => {
    await api.logout().catch(() => {});
    closeSocket();
    useRealtime.getState().reset();
    qc.clear();
    qc.setQueryData(keys.me, null);
    navigate('/login', { replace: true });
  }, [qc, navigate]);
}
