import { firstAdminSchema } from '@cui/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Navigate } from 'react-router';
import { Spinner } from '@/components/feedback';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { useMe } from '@/hooks/queries';
import { ApiError, api } from '@/lib/api';
import { keys } from '@/lib/cache';

/** First run on an empty database: creates the IT Services administrator from the browser. */
export function SetupPage() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const status = useQuery({ queryKey: ['setup-status'], queryFn: api.setupStatus });
  const [form, setForm] = useState({
    setupCode: '',
    name: '',
    email: '',
    password: '',
    confirm: '',
  });
  const [error, setError] = useState<string | null>(null);

  const setup = useMutation({
    mutationFn: api.setup,
    onSuccess: ({ user }) => {
      // Signed in: the check below sends the new admin to the console.
      qc.setQueryData(keys.me, user);
      qc.setQueryData(['setup-status'], { needed: false, codeRequired: false });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Setup failed.'),
  });

  if (me) return <Navigate to="/admin" replace />;
  if (status.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="[&_svg]:size-6" />
      </div>
    );
  }
  if (!status.data?.needed) return <Navigate to="/login" replace />;
  const codeRequired = status.data.codeRequired;

  const update = (field: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (codeRequired && !form.setupCode.trim()) {
      setError('Enter the setup code.');
      return;
    }
    const parsed = firstAdminSchema.safeParse({
      name: form.name,
      email: form.email,
      password: form.password,
      setupCode: codeRequired ? form.setupCode.trim() : undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check your details.');
      return;
    }
    if (form.password !== form.confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setup.mutate(parsed.data);
  };

  return (
    <div className="min-h-full bg-surface-2">
      <div className="mx-auto flex max-w-[440px] flex-col px-6 pt-14 pb-10">
        <div className="flex items-center justify-center gap-2.5">
          <Logo size={34} />
          <span className="text-[20px] font-bold tracking-tight">CUI Connect</span>
        </div>

        <h1 className="mt-10 text-center text-[26px] leading-tight font-bold tracking-tight">
          Set up CUI Connect
        </h1>
        <p className="mt-2 text-center text-[15px] text-muted-foreground">
          Create the IT Services administrator. You will then add departments, people, sections and
          courses from the admin console.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
          {codeRequired && (
            <Field
              label="Setup code"
              htmlFor="setupCode"
              hint="The SETUP_CODE you chose when deploying. It stops anyone else from claiming this site."
            >
              <Input
                id="setupCode"
                type="password"
                autoComplete="off"
                value={form.setupCode}
                onChange={update('setupCode')}
                className="h-10"
                autoFocus
              />
            </Field>
          )}
          <Field label="Your name" htmlFor="name">
            <Input
              id="name"
              autoComplete="name"
              placeholder="e.g. Salman Ahmed"
              value={form.name}
              onChange={update('name')}
              className="h-10"
              autoFocus={!codeRequired}
            />
          </Field>
          <Field label="Email" htmlFor="email" hint="You will sign in with this email.">
            <Input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="name@comsats.edu.pk"
              value={form.email}
              onChange={update('email')}
              className="h-10"
            />
          </Field>
          <Field label="Password" htmlFor="password" hint="At least 8 characters.">
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={update('password')}
              className="h-10"
            />
          </Field>
          <Field label="Repeat the password" htmlFor="confirm">
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={form.confirm}
              onChange={update('confirm')}
              className="h-10"
            />
          </Field>
          {error && (
            <p
              role="alert"
              className="rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-[13.5px] text-danger"
            >
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" size="lg" loading={setup.isPending}>
            Create administrator
          </Button>
        </form>
      </div>
    </div>
  );
}
