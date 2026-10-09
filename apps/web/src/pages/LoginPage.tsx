import { loginSchema } from '@cui/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Eye, EyeOff } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Logo } from '@/components/Logo';
import { Avatar, roleLabel } from '@/components/people';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { useMe } from '@/hooks/queries';
import { ApiError, api, type DemoAccount } from '@/lib/api';
import { keys } from '@/lib/cache';

export function LoginPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const demo = useQuery({ queryKey: ['demo-accounts'], queryFn: api.demoAccounts, retry: false });
  const setupStatus = useQuery({ queryKey: ['setup-status'], queryFn: api.setupStatus });

  const login = useMutation({
    mutationFn: api.login,
    onSuccess: ({ user }) => {
      qc.setQueryData(keys.me, user);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : '/chat', { replace: true });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Sign-in failed.'),
  });

  if (me) return <Navigate to="/chat" replace />;
  if (setupStatus.data?.needed) return <Navigate to="/setup" replace />;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsed = loginSchema.safeParse({ identifier, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check your details.');
      return;
    }
    login.mutate(parsed.data);
  };

  const signInAs = (account: DemoAccount) => {
    if (!demo.data) return;
    setIdentifier(account.identifier);
    setPassword(demo.data.password);
    setError(null);
    login.mutate({ identifier: account.identifier, password: demo.data.password });
  };

  return (
    <div className="min-h-full bg-surface-2">
      <div className="mx-auto flex max-w-[440px] flex-col px-6 pt-14 pb-10">
        <div className="flex items-center justify-center gap-2.5">
          <Logo size={34} />
          <span className="text-[20px] font-bold tracking-tight">CUI Connect</span>
        </div>

        <h1 className="mt-10 text-center text-[26px] leading-tight font-bold tracking-tight">
          Sign in to COMSATS Islamabad
        </h1>
        <p className="mt-2 text-center text-[15px] text-muted-foreground">
          Use your university email, or your registration number if you are a student.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
          <Field label="Email or registration number" htmlFor="identifier">
            <Input
              id="identifier"
              autoComplete="username"
              placeholder="name@comsats.edu.pk"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="h-10"
              autoFocus
            />
          </Field>
          <Field label="Password" htmlFor="password">
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </Field>
          {error && (
            <p
              role="alert"
              className="rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-[13.5px] text-danger"
            >
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" size="lg" loading={login.isPending}>
            Sign in
          </Button>
        </form>
        <p className="mt-4 text-center text-[13px] text-muted-foreground">
          Trouble signing in? Contact IT Services at the admin block.
        </p>

        {demo.data && (
          <section className="mt-10 overflow-hidden rounded-lg border bg-surface">
            <header className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
              <h2 className="text-[13.5px] font-bold">Demo accounts</h2>
              <span className="text-[12.5px] text-muted-foreground">
                Password{' '}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] text-foreground">
                  {demo.data.password}
                </code>
              </span>
            </header>
            <ul className="divide-y">
              {demo.data.accounts.map((account) => (
                <li key={account.identifier}>
                  <button
                    type="button"
                    onClick={() => signInAs(account)}
                    disabled={login.isPending}
                    aria-label={`Sign in as ${account.label} (${roleLabel({ name: account.label, role: account.role })})`}
                    className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2 disabled:opacity-60"
                  >
                    <Avatar name={account.label} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[14px] font-semibold">{account.label}</span>
                        <Badge tone={account.role === 'faculty' ? 'primary' : 'neutral'}>
                          {roleLabel({ name: account.label, role: account.role })}
                        </Badge>
                      </span>
                      <span className="block truncate font-mono text-[12px] text-muted-foreground">
                        {account.identifier}
                      </span>
                    </span>
                    <ChevronRight
                      className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden
                    />
                  </button>
                </li>
              ))}
            </ul>
            <p className="border-t bg-surface-2 px-4 py-2 text-[12px] text-muted-foreground">
              Open a private window to sign in as a second person at the same time.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
