import { type QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { z } from 'zod';
import { ApiError } from '@/lib/api';

export const errorMessage = (err: unknown) =>
  err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';

/** A button action (no form): runs, shows the outcome, refreshes the given queries. */
export function useAction<A, R>(
  run: (arg: A) => Promise<R>,
  options: { done?: string | ((result: R) => string); invalidate?: QueryKey[] } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (result) => {
      const done = typeof options.done === 'function' ? options.done(result) : options.done;
      if (done) toast.success(done);
      for (const key of options.invalidate ?? []) void qc.invalidateQueries({ queryKey: key });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

/**
 * Validates a form with the shared Zod schema (the same one the server uses), submits it, then
 * refreshes the given queries. The first problem is shown as a toast.
 */
export function useSubmit<S extends z.ZodType, R>(
  schema: S,
  submit: (input: z.output<S>) => Promise<R>,
  options: { done?: string | ((result: R) => string); invalidate?: QueryKey[] } = {},
) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: submit,
    onSuccess: (result) => {
      const done = typeof options.done === 'function' ? options.done(result) : options.done;
      if (done) toast.success(done);
      for (const key of options.invalidate ?? []) void qc.invalidateQueries({ queryKey: key });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return {
    pending: mutation.isPending,
    run: (raw: unknown, onDone?: (result: R) => void) => {
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
        toast.error(issue ? `${where}${issue.message}` : 'Check the form');
        return;
      }
      mutation.mutate(parsed.data, { onSuccess: (result) => onDone?.(result) });
    },
  };
}
