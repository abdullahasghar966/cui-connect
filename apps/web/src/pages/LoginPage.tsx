import { loginSchema } from '@cui/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, LockKeyhole, LogIn, Megaphone, ShieldCheck, Users } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Avatar, roleLabel } from '@/components/people';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { useMe } from '@/hooks/queries';
import { ApiError, api, type DemoAccount } from '@/lib/api';
import { keys } from '@/lib/cache';

const FEATURES = [
  {
    icon: Megaphone,
    title: 'Official channels',
    text: "Campus and department notices that only the Director's Office, HODs and offices can post.",
  },
  {
    icon: Users,
    title: 'Class & course groups',
    text: 'Created automatically from sections and enrollments, with instructors as moderators.',
  },
  {
    icon: ShieldCheck,
    title: 'Communication boundaries',
    text: 'Every message is checked on the server: who can talk where, and who can message whom.',
  },
];

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
    <div className="grid min-h-full lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[#13285f] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              'radial-gradient(60% 50% at 20% 10%, #2f56c9 0%, transparent 70%), radial-gradient(50% 40% at 90% 90%, #1d3a8a 0%, transparent 70%)',
          }}
        />
        <div className="relative flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="size-10 rounded-xl ring-1 ring-white/20" />
          <div>
            <p className="text-lg font-semibold tracking-tight">CUI Connect</p>
            <p className="text-sm text-white/70">COMSATS University Islamabad</p>
          </div>
        </div>
        <div className="relative max-w-lg">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight">
            One place for every conversation on campus.
          </h1>
          <p className="mt-4 text-white/75">
            Announcements, classes, courses, societies and offices, each with clear rules about who
            can say what to whom.
          </p>
          <ul className="mt-10 space-y-5">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="text-sm text-white/70">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/50">
          Advanced Web Technologies · Lab Assignment 1 · Socket.IO
        </p>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src="/favicon.svg" alt="" className="size-10 rounded-xl" />
            <div>
              <p className="font-semibold">CUI Connect</p>
              <p className="text-sm text-muted-foreground">COMSATS University Islamabad</p>
            </div>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Use your university email, or your registration number if you are a student.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <Field label="Email or registration number" htmlFor="identifier">
              <Input
                id="identifier"
                autoComplete="username"
                placeholder="FA23-BCS-001 or name@comsats.edu.pk"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
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
                  className="pr-10"
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
              <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" size="lg" loading={login.isPending}>
              <LogIn /> Sign in
            </Button>
          </form>

          {demo.data && (
            <section className="mt-8">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Demo accounts</h3>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <LockKeyhole className="size-3" aria-hidden /> Password:{' '}
                  <code className="rounded bg-muted px-1 py-0.5">{demo.data.password}</code>
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Sign in as different people in two browser windows to see the boundaries live.
              </p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {demo.data.accounts.map((account) => (
                  <li key={account.identifier}>
                    <button
                      type="button"
                      onClick={() => signInAs(account)}
                      disabled={login.isPending}
                      aria-label={`Sign in as ${account.label} (${roleLabel({ name: account.label, role: account.role })})`}
                      className="flex w-full items-start gap-2.5 rounded-xl border bg-surface p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary-soft/40 disabled:opacity-60"
                    >
                      <Avatar name={account.label} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{account.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {roleLabel({ name: account.label, role: account.role })} ·{' '}
                          {account.identifier}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
