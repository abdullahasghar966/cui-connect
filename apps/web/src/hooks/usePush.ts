/**
 * Phone/desktop push notifications for this browser: ask permission, subscribe at the
 * browser's push service with the server's public key, and tell the server where to send.
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { errorMessage } from './useSubmit';

export type PushState = 'unsupported' | 'install-first' | 'blocked' | 'off' | 'on' | 'checking';

const supported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

/** iPhones only allow web push once the site is added to the Home Screen. */
const iosBrowserTab = () =>
  typeof navigator !== 'undefined' &&
  /iphone|ipad|ipod/i.test(navigator.userAgent) &&
  !window.matchMedia('(display-mode: standalone)').matches;

/** The service worker, or null if it isn't ready within a few seconds. */
async function worker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  const timeout = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 4000));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Signing out: this browser stops receiving the person's notifications. */
export async function stopPushOnThisDevice(): Promise<void> {
  if (!supported()) return;
  const registration = await worker();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await api.push.unsubscribe(subscription.endpoint).catch(() => {});
  await subscription.unsubscribe().catch(() => {});
}

export function usePush() {
  const [state, setState] = useState<PushState>('checking');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported()) {
      setState(iosBrowserTab() ? 'install-first' : 'unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('blocked');
      return;
    }
    let cancelled = false;
    void (async () => {
      const registration = await worker();
      const subscription = await registration?.pushManager.getSubscription();
      if (!cancelled) setState(subscription ? 'on' : registration ? 'off' : 'unsupported');
    })().catch(() => !cancelled && setState('off'));
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off');
        return;
      }
      const registration = await worker();
      if (!registration) throw new Error('Notifications are not available in this browser.');
      const { publicKey } = await api.push.key();
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(publicKey),
      });
      const json = subscription.toJSON();
      await api.push.subscribe({
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
      });
      setState('on');
      toast.success('Notifications are on for this device');
    } catch (err) {
      toast.error(
        err instanceof Error && !('status' in err)
          ? `Could not turn notifications on: ${err.message}`
          : errorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      await stopPushOnThisDevice();
      setState('off');
      toast.success('Notifications are off for this device');
    } finally {
      setBusy(false);
    }
  }, []);

  const test = useCallback(async () => {
    try {
      const { sent } = await api.push.test();
      if (sent) toast.success('Test notification sent');
      else toast.error('No device received it. Turn notifications off and on again.');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, []);

  return { state, busy, enable, disable, test };
}
