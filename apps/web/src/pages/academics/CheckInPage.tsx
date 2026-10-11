import { type CheckInResultDTO, formatShortDate } from '@cui/shared';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, Clock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Spinner } from '@/components/feedback';
import { buttonVariants } from '@/components/ui/button';
import { ApiError, api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { cn } from '@/lib/utils';

type State =
  | { kind: 'checking' }
  | { kind: 'done'; result: CheckInResultDTO }
  | { kind: 'failed'; message: string };

/** Where the attendance QR code leads: checks the student in as soon as the page opens. */
export default function CheckInPage() {
  const { sessionId = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('t') ?? '';
  const qc = useQueryClient();
  const [state, setState] = useState<State>({ kind: 'checking' });
  const started = useRef(false);

  useEffect(() => {
    // Once only, even when React runs effects twice in development.
    if (started.current) return;
    started.current = true;
    api.academics
      .checkIn(sessionId, token)
      .then((result) => {
        setState({ kind: 'done', result });
        void qc.invalidateQueries({ queryKey: keys.myAttendance });
      })
      .catch((err) =>
        setState({
          kind: 'failed',
          message: err instanceof ApiError ? err.message : 'Cannot reach the server.',
        }),
      );
  }, [qc, sessionId, token]);

  return (
    <main className="flex min-w-0 flex-1 items-center justify-center overflow-y-auto bg-background p-6">
      <div className="w-full max-w-sm rounded-xl border bg-surface p-6 text-center shadow-sm">
        {state.kind === 'checking' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Spinner className="[&_svg]:size-6" label="Checking you in" />
            <p className="text-[15px] font-semibold">Checking you in…</p>
          </div>
        )}
        {state.kind === 'done' && (
          <div className="flex flex-col items-center gap-2" role="status">
            {state.result.status === 'late' ? (
              <Clock className="size-12 text-warning" aria-hidden />
            ) : (
              <CircleCheck className="size-12 text-primary dark:text-link" aria-hidden />
            )}
            <h1 className="text-[20px] font-bold">
              {state.result.already
                ? 'You are already checked in'
                : state.result.status === 'late'
                  ? 'Checked in, marked late'
                  : 'You are checked in'}
            </h1>
            <p className="text-[14px] text-muted-foreground">
              {state.result.course.code} {state.result.course.title} ·{' '}
              {state.result.course.sectionName}
              <br />
              {formatShortDate(state.result.date)}
            </p>
          </div>
        )}
        {state.kind === 'failed' && (
          <div className="flex flex-col items-center gap-2" role="alert">
            <CircleAlert className="size-12 text-danger" aria-hidden />
            <h1 className="text-[20px] font-bold">Not checked in</h1>
            <p className="text-[14px] text-muted-foreground">{state.message}</p>
          </div>
        )}
        {state.kind !== 'checking' && (
          <div className="mt-5 flex justify-center gap-2">
            <Link
              to="/academics/attendance"
              className={cn(
                buttonVariants({ variant: state.kind === 'done' ? 'primary' : 'outline' }),
              )}
            >
              My attendance
            </Link>
            <Link to="/home" className={buttonVariants({ variant: 'outline' })}>
              Home
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
