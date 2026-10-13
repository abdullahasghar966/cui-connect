import { BellRing, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type PushState, usePush } from '@/hooks/usePush';

/** Turning phone/desktop notifications on for this browser. */
export function PushCard() {
  const push = usePush();
  if (push.state === 'checking') return null;
  const text: Record<Exclude<PushState, 'checking'>, string> = {
    on: 'On for this device. You get alerts even when CUI Connect is closed.',
    off: 'Get alerts on this device even when CUI Connect is closed: marks, class changes, mentions and direct messages while you are away.',
    blocked:
      'Notifications are blocked for this site. Allow them in your browser’s site settings, then come back.',
    unsupported: 'This browser can’t show notifications from websites.',
    'install-first':
      'On iPhone, first add CUI Connect to your Home Screen (Share → Add to Home Screen), then open it from there.',
  };
  return (
    <section
      aria-label="Phone notifications"
      className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border bg-surface px-4 py-3"
    >
      <Smartphone className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold">Phone notifications</p>
        <p className="text-[13px] text-muted-foreground">{text[push.state]}</p>
      </div>
      {push.state === 'off' && (
        <Button loading={push.busy} onClick={() => void push.enable()}>
          <BellRing /> Turn on
        </Button>
      )}
      {push.state === 'on' && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void push.test()}>
            Send a test
          </Button>
          <Button variant="ghost" loading={push.busy} onClick={() => void push.disable()}>
            Turn off
          </Button>
        </div>
      )}
    </section>
  );
}
