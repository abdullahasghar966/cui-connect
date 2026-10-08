import type { ReactNode } from 'react';
import { useTypingNames } from '@/state/realtime';

function sentence(names: string[]): ReactNode {
  if (names.length === 1) {
    return (
      <>
        <span className="font-semibold">{names[0]}</span> is typing…
      </>
    );
  }
  if (names.length === 2) {
    return (
      <>
        <span className="font-semibold">{names[0]}</span> and{' '}
        <span className="font-semibold">{names[1]}</span> are typing…
      </>
    );
  }
  return 'Several people are typing…';
}

/** Sits under the composer; the line is always reserved so nothing jumps. */
export function TypingIndicator({ groupId }: { groupId: string }) {
  const names = useTypingNames(groupId);
  return (
    <div
      className="flex h-6 items-center gap-1.5 px-1 text-[12px] text-muted-foreground"
      aria-live="polite"
    >
      {names.length > 0 && (
        <>
          <span className="inline-flex gap-0.5" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="typing-dot size-1 rounded-full bg-muted-foreground"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </span>
          <span>{sentence(names)}</span>
        </>
      )}
    </div>
  );
}
