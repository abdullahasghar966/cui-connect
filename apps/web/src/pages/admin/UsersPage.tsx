import {
  type CreateUserInput,
  createUserSchema,
  OFFICE_LABELS,
  OFFICES,
  type Office,
  ROLE_LABELS,
  ROLES,
  type Role,
  type UpdateUserInput,
  type UserDTO,
  updateUserSchema,
} from '@cui/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ellipsis,
  FileUp,
  KeyRound,
  Pencil,
  Save,
  Search,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, Spinner } from '@/components/feedback';
import { Avatar, RoleBadge } from '@/components/people';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/menu';
import { useDebounced } from '@/hooks/useDebounced';
import { ApiError, api } from '@/lib/api';
import { Card, PageHeader, Table } from './ui';

const errorMessage = (err: unknown) =>
  err instanceof ApiError ? err.message : 'Something went wrong';

function CreateUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const departments = useQuery({
    queryKey: ['admin', 'departments'],
    queryFn: api.admin.departments,
    enabled: open,
  });
  const sections = useQuery({
    queryKey: ['admin', 'sections'],
    queryFn: api.admin.sections,
    enabled: open,
  });
  const [role, setRole] = useState<Role>('student');
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    regNo: '',
    designation: '',
    departmentId: '',
    sectionId: '',
    office: '' as Office | '',
    isCR: false,
    isHOD: false,
  });
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const create = useMutation({
    mutationFn: (input: CreateUserInput) => api.admin.createUser(input),
    onSuccess: (user) => {
      toast.success(`${user.name} can now sign in. Their groups were provisioned automatically.`);
      void qc.invalidateQueries({ queryKey: ['admin'] });
      onOpenChange(false);
      setForm((f) => ({ ...f, name: '', email: '', regNo: '', isCR: false, isHOD: false }));
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsed = createUserSchema.safeParse({
      name: form.name,
      email: form.email,
      password: form.password,
      role,
      regNo: role === 'student' ? form.regNo || null : null,
      designation: form.designation || null,
      departmentId: role === 'student' ? null : form.departmentId || null,
      sectionId: role === 'student' ? form.sectionId || null : null,
      office: role === 'staff' ? form.office || null : null,
      isCR: role === 'student' && form.isCR,
      isHOD: role === 'faculty' && form.isHOD,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(issue ? `${issue.path.join('.') || 'form'}: ${issue.message}` : 'Check the form');
      return;
    }
    create.mutate(parsed.data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        wide
        title="Add a user"
        description="Accounts are provisioned by IT. The person is added to the right official groups automatically."
      >
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Role" htmlFor="role">
            <Select id="role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Full name" htmlFor="name">
            <Input id="name" value={form.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => set({ email: e.target.value })}
              placeholder={
                role === 'student'
                  ? 'fa25-bcs-001@isbstudent.comsats.edu.pk'
                  : 'name@comsats.edu.pk'
              }
            />
          </Field>
          <Field label="Initial password" htmlFor="password" hint="At least 8 characters">
            <Input
              id="password"
              type="text"
              value={form.password}
              onChange={(e) => set({ password: e.target.value })}
            />
          </Field>
          {role === 'student' ? (
            <>
              <Field label="Registration number" htmlFor="regNo">
                <Input
                  id="regNo"
                  value={form.regNo}
                  onChange={(e) => set({ regNo: e.target.value })}
                  placeholder="FA25-BCS-001"
                />
              </Field>
              <Field label="Section" htmlFor="section">
                <Select
                  id="section"
                  value={form.sectionId}
                  onChange={(e) => set({ sectionId: e.target.value })}
                >
                  <option value="">Select a section…</option>
                  {sections.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.departmentCode})
                    </option>
                  ))}
                </Select>
              </Field>
              <Checkbox
                label="Class representative (CR)"
                checked={form.isCR}
                onChange={(e) => set({ isCR: e.target.checked })}
              />
            </>
          ) : (
            <>
              <Field label="Designation" htmlFor="designation">
                <Input
                  id="designation"
                  value={form.designation}
                  onChange={(e) => set({ designation: e.target.value })}
                  placeholder={role === 'faculty' ? 'Assistant Professor' : 'Officer'}
                />
              </Field>
              <Field
                label="Department"
                htmlFor="department"
                hint={role === 'faculty' ? 'Required for faculty' : 'Optional'}
              >
                <Select
                  id="department"
                  value={form.departmentId}
                  onChange={(e) => set({ departmentId: e.target.value })}
                >
                  <option value="">
                    {role === 'faculty' ? 'Select a department…' : 'None (campus-wide)'}
                  </option>
                  {departments.data?.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} · {d.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {role === 'staff' && (
                <Field label="Office" htmlFor="office">
                  <Select
                    id="office"
                    value={form.office}
                    onChange={(e) => set({ office: e.target.value as Office })}
                  >
                    <option value="">Select an office…</option>
                    {OFFICES.map((o) => (
                      <option key={o} value={o}>
                        {OFFICE_LABELS[o]}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {role === 'faculty' && (
                <Checkbox
                  label="Head of Department (replaces the current HOD)"
                  checked={form.isHOD}
                  onChange={(e) => set({ isHOD: e.target.checked })}
                />
              )}
            </>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger sm:col-span-2"
            >
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              <UserPlus /> Create account
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const SAMPLE_CSV = `name,email,role,department,section,regNo,isCR
Areeba Nadeem,fa25-bcs-001@isbstudent.comsats.edu.pk,student,,BCS-7A,FA25-BCS-001,false
Dr. Kashif Ali,kashif.ali@comsats.edu.pk,faculty,CS,,,`;

function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [csv, setCsv] = useState(SAMPLE_CSV);
  const [password, setPassword] = useState('Welcome@2026');
  const importUsers = useMutation({
    mutationFn: () => api.admin.importUsers(csv, password || undefined),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      if (result.created) toast.success(`Imported ${result.created} account(s)`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) importUsers.reset();
      }}
    >
      <DialogContent
        wide
        title="Import users from CSV"
        description="Register a whole section at the start of term. Columns: name, email, role, department (code), section (name), regNo, designation, office, isCR, isHOD, password."
      >
        <div className="space-y-4">
          <Field label="CSV" htmlFor="csv">
            <Textarea
              id="csv"
              rows={8}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              className="font-mono text-xs"
            />
          </Field>
          <Field
            label="Default password"
            htmlFor="defaultPassword"
            hint="Used for rows without a password column"
          >
            <Input
              id="defaultPassword"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {importUsers.data && (
            <div className="rounded-xl border bg-surface-2 p-3 text-sm">
              <p className="font-medium">
                {importUsers.data.created} created · {importUsers.data.errors.length} error(s)
              </p>
              {importUsers.data.errors.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-danger">
                  {importUsers.data.errors.map((e) => (
                    <li key={`${e.line}-${e.message}`}>
                      Line {e.line}: {e.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button onClick={() => importUsers.mutate()} loading={importUsers.isPending}>
              <FileUp /> Import
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Edits profile and placement. Changing a student's section or a staff member's department
 * re-syncs their official groups on the server, and their sidebar updates live.
 */
function EditUserDialog({ user, onClose }: { user: UserDTO | null; onClose: () => void }) {
  const qc = useQueryClient();
  const departments = useQuery({
    queryKey: ['admin', 'departments'],
    queryFn: api.admin.departments,
    enabled: !!user,
  });
  const sections = useQuery({
    queryKey: ['admin', 'sections'],
    queryFn: api.admin.sections,
    enabled: !!user,
  });
  const [form, setForm] = useState({
    name: '',
    email: '',
    designation: '',
    departmentId: '',
    sectionId: '',
    office: '' as Office | '',
  });
  useEffect(() => {
    if (!user) return;
    setForm({
      name: user.name,
      email: user.email,
      designation: user.designation ?? '',
      departmentId: user.departmentId ?? '',
      sectionId: user.sectionId ?? '',
      office: user.office ?? '',
    });
  }, [user]);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const save = useMutation({
    mutationFn: (patch: UpdateUserInput) => api.admin.updateUser(user?.id ?? '', patch),
    onSuccess: (updated) => {
      toast.success(`${updated.name} updated. Their groups were re-synced.`);
      void qc.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    const patch: UpdateUserInput = {};
    if (form.name !== user.name) patch.name = form.name;
    if (form.email !== user.email) patch.email = form.email;
    if ((form.designation || null) !== user.designation)
      patch.designation = form.designation || null;
    if (user.role === 'student') {
      if (form.sectionId !== (user.sectionId ?? '')) patch.sectionId = form.sectionId;
    } else if (form.departmentId !== (user.departmentId ?? '')) {
      patch.departmentId = form.departmentId || null;
    }
    if (user.role === 'staff' && form.office !== (user.office ?? '')) {
      patch.office = form.office || null;
    }
    if (user.role === 'faculty' && !form.departmentId) {
      toast.error('Faculty must belong to a department.');
      return;
    }
    if (user.role === 'staff' && form.office === 'DEPARTMENT' && !form.departmentId) {
      toast.error('Department office staff need a department.');
      return;
    }
    if (!Object.keys(patch).length) {
      onClose();
      return;
    }
    const parsed = updateUserSchema.safeParse(patch);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      toast.error(issue ? `${issue.path.join('.') || 'form'}: ${issue.message}` : 'Check the form');
      return;
    }
    save.mutate(parsed.data);
  };

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        wide
        title={`Edit ${user?.name ?? 'user'}`}
        description={
          user?.role === 'student'
            ? 'Moving a student to another section swaps their class group immediately. Course enrollments stay as they are.'
            : 'Changing the department moves them to that department’s notices and faculty lounge.'
        }
      >
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="edit-name">
            <Input
              id="edit-name"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </Field>
          <Field label="Email" htmlFor="edit-email">
            <Input
              id="edit-email"
              type="email"
              value={form.email}
              onChange={(e) => set({ email: e.target.value })}
            />
          </Field>
          <Field label="Designation" htmlFor="edit-designation">
            <Input
              id="edit-designation"
              value={form.designation}
              onChange={(e) => set({ designation: e.target.value })}
            />
          </Field>
          {user?.role === 'student' ? (
            <Field label="Section" htmlFor="edit-section">
              <Select
                id="edit-section"
                value={form.sectionId}
                onChange={(e) => set({ sectionId: e.target.value })}
              >
                {sections.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.departmentCode})
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Department" htmlFor="edit-department">
              <Select
                id="edit-department"
                value={form.departmentId}
                onChange={(e) => set({ departmentId: e.target.value })}
              >
                {user?.role !== 'faculty' && <option value="">None (campus-wide)</option>}
                {departments.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} · {d.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {user?.role === 'staff' && (
            <Field label="Office" htmlFor="edit-office">
              <Select
                id="edit-office"
                value={form.office}
                onChange={(e) => set({ office: e.target.value as Office })}
              >
                {OFFICES.map((o) => (
                  <option key={o} value={o}>
                    {OFFICE_LABELS[o]}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              <Save /> Save changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: UserDTO | null; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const reset = useMutation({
    mutationFn: () => api.admin.updateUser(user?.id ?? '', { password }),
    onSuccess: () => {
      toast.success(`Password reset. ${user?.name} was signed out everywhere.`);
      setPassword('');
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Reset password for ${user?.name ?? ''}`}
        description="All of their active sessions end immediately."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            reset.mutate();
          }}
          className="space-y-4"
        >
          <Field label="New password" htmlFor="newPassword" hint="At least 8 characters">
            <Input
              id="newPassword"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={password.length < 8} loading={reset.isPending}>
              <KeyRound /> Reset password
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function UsersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [resetFor, setResetFor] = useState<UserDTO | null>(null);
  const [editing, setEditing] = useState<UserDTO | null>(null);
  const search = useDebounced(q);
  const users = useQuery({
    queryKey: ['admin', 'users', search, role],
    queryFn: () => api.admin.users({ q: search, role: role || undefined }),
    // Keep the current rows on screen while a new search loads (no spinner flash).
    placeholderData: keepPreviousData,
  });

  const update = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Parameters<typeof api.admin.updateUser>[1];
    }) => api.admin.updateUser(id, patch),
    onSuccess: (user, { patch }) => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      if (patch.active === false) toast.success(`${user.name} was deactivated and disconnected`);
      else if (patch.active === true) toast.success(`${user.name} was reactivated`);
      else toast.success(`${user.name} updated. Group memberships were re-synced.`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <>
      <PageHeader
        title="Users"
        description="Students, faculty, staff and administrators. Changing a role flag or section re-syncs their groups live."
        actions={
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <FileUp /> Import CSV
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <UserPlus /> Add user
            </Button>
          </>
        }
      />
      <Card
        title={
          users.data
            ? `${users.data.length} ${users.data.length === 1 ? 'person' : 'people'}`
            : 'People'
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name, email or reg. no."
                aria-label="Search users"
                className="w-60 pl-8"
              />
            </div>
            <Select
              value={role}
              onChange={(e) => setRole(e.target.value as Role | '')}
              aria-label="Filter by role"
              className="w-36"
            >
              <option value="">All roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </div>
        }
      >
        {users.isPending ? (
          <div className="p-6">
            <Spinner />
          </div>
        ) : !users.data?.length ? (
          <EmptyState icon={Users} title="No users match" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>ID / designation</th>
                <th>Department · section</th>
                <th>Status</th>
                <th className="w-10">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.data.map((user) => (
                <tr key={user.id} className={user.active ? undefined : 'opacity-60'}>
                  <td>
                    <span className="flex items-center gap-2.5">
                      <Avatar name={user.name} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{user.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {user.email}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td>
                    <span className="flex items-center gap-1">
                      <RoleBadge person={user} showStudent />
                      {user.role === 'student' && user.isCR && (
                        <Badge tone="neutral">Student</Badge>
                      )}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-muted-foreground">
                    {user.regNo ?? user.designation ?? '—'}
                  </td>
                  <td className="whitespace-nowrap text-muted-foreground">
                    {[user.departmentCode, user.sectionName].filter(Boolean).join(' · ') ||
                      'Campus-wide'}
                  </td>
                  <td>
                    {user.active ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <Badge tone="danger">Deactivated</Badge>
                    )}
                  </td>
                  <td>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Actions for ${user.name}`}
                        >
                          <Ellipsis />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onSelect={() => setEditing(user)}>
                          <Pencil /> Edit details
                        </DropdownMenuItem>
                        {user.role === 'student' && (
                          <DropdownMenuItem
                            onSelect={() =>
                              update.mutate({ id: user.id, patch: { isCR: !user.isCR } })
                            }
                          >
                            <ShieldCheck />{' '}
                            {user.isCR ? 'Remove CR role' : 'Make class representative'}
                          </DropdownMenuItem>
                        )}
                        {user.role === 'faculty' && !user.isHOD && (
                          <DropdownMenuItem
                            onSelect={() => update.mutate({ id: user.id, patch: { isHOD: true } })}
                          >
                            <ShieldCheck /> Appoint as HOD
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onSelect={() => setResetFor(user)}>
                          <KeyRound /> Reset password
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {user.active ? (
                          <DropdownMenuItem
                            danger
                            onSelect={() =>
                              update.mutate({ id: user.id, patch: { active: false } })
                            }
                          >
                            <UserX /> Deactivate (signs them out)
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onSelect={() => update.mutate({ id: user.id, patch: { active: true } })}
                          >
                            <UserCheck /> Reactivate
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <ResetPasswordDialog user={resetFor} onClose={() => setResetFor(null)} />
      <EditUserDialog user={editing} onClose={() => setEditing(null)} />
    </>
  );
}
