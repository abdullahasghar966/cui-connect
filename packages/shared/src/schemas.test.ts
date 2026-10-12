import { describe, expect, it } from 'vitest';
import { isPushServiceUrl, pushSubscriptionSchema } from './schemas';

describe('push subscriptions', () => {
  it('accept only the browsers’ push services over https', () => {
    expect(isPushServiceUrl('https://fcm.googleapis.com/fcm/send/abc:123')).toBe(true);
    expect(isPushServiceUrl('https://updates.push.services.mozilla.com/wpush/v2/gAAA')).toBe(true);
    expect(isPushServiceUrl('https://wns2-by3p.notify.windows.com/w/?token=x')).toBe(true);
    expect(isPushServiceUrl('https://web.push.apple.com/QGuQyavXutnMH')).toBe(true);
  });

  it('refuse anything that could make the server call somewhere else (SSRF)', () => {
    expect(isPushServiceUrl('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
    expect(isPushServiceUrl('https://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isPushServiceUrl('https://localhost:4000/api/admin')).toBe(false);
    expect(isPushServiceUrl('https://fcm.googleapis.com@evil.example/x')).toBe(false);
    expect(isPushServiceUrl('https://fcm.googleapis.com.evil.example/x')).toBe(false);
    expect(isPushServiceUrl('https://evilfcm.googleapis.com.example/x')).toBe(false);
    expect(isPushServiceUrl('javascript:alert(1)')).toBe(false);
  });

  it('need both browser keys', () => {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/abc:123';
    expect(pushSubscriptionSchema.safeParse({ endpoint }).success).toBe(false);
    expect(
      pushSubscriptionSchema.safeParse({
        endpoint,
        keys: { p256dh: 'BOr1x9sQ0z6lH2ZtU8W8eK3pS4dM7cN1', auth: 'k8JV6sjdbhAi' },
      }).success,
    ).toBe(true);
  });
});
