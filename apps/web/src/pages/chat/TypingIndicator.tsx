import { useTypingNames } from '@/state/realtime';

function sentence(names: string[]): string {
  if (names.length === 1) return `${names[0]} is typing`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing`;
  return 'Several people are typing';
}

export function TypingIndicator({ groupId }: { groupId: string }) {
  const names = useTypingNames(groupId);
  return (
    <div
      className="flex h-6 items-center gap-2 pl-11 text-xs text-muted-foreground"
      aria-live="polite"
    >
      {names.length > 0 && (
        <>
          <span className="inline-flex gap-0.5" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="typing-dot size-1.5 rounded-full bg-muted-foreground"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </span>
          <span>{sentence(names)}…</span>
        </>
      )}
    </div>
  );
}
