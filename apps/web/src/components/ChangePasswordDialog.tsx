import { changePasswordSchema } from '@cui/shared';
import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/form';
import { ApiError, api } from '@/lib/api';
import { getSocket } from '@/lib/socket';

const EMPTY = { current: '', next: '', confirm: '' };

/** Lets anyone replace the password IT Services gave them. Other devices are signed out. */
export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const close = (next: boolean) => {
    if (!next) {
      setForm(EMPTY);
      setError(null);
    }
    onOpenChange(next);
  };

  const change = useMutation({
    mutationFn: api.changePassword,
    onSuccess: () => {
      toast.success('Password changed. Your other devices were signed out.');
      close(false);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not change it.'),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsed = changePasswordSchema.safeParse({
      currentPassword: form.current,
      newPassword: form.next,
      keepSocketId: getSocket().id,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the passwords.');
      return;
    }
    if (form.next !== form.confirm) {
      setError('The new passwords do not match.');
      return;
    }
    change.mutate(parsed.data);
  };

  const update = (field: keyof typeof EMPTY) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        title="Change password"
        description="Use at least 8 characters. You stay signed in here; other devices are signed out."
      >
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Current password" htmlFor="currentPassword">
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              value={form.current}
              onChange={update('current')}
              autoFocus
            />
          </Field>
          <Field label="New password" htmlFor="newPassword">
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={form.next}
              onChange={update('next')}
            />
          </Field>
          <Field label="Repeat the new password" htmlFor="confirmPassword">
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={form.confirm}
              onChange={update('confirm')}
            />
          </Field>
          {error && (
            <p role="alert" className="text-[13.5px] text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={change.isPending}>
              Change password
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
