import { createCourseSchema, createDepartmentSchema, createSectionSchema } from '@cui/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Spinner } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { ApiError, api } from '@/lib/api';
import { Card, PageHeader, Table } from './ui';

const errorMessage = (err: unknown) =>
  err instanceof ApiError ? err.message : 'Something went wrong';

/** Validates with the shared schema, then submits; shows the first problem as a toast. */
function useCreate<S extends z.ZodType>(
  schema: S,
  submit: (input: z.output<S>) => Promise<unknown>,
  done: string,
) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: submit,
    onSuccess: () => {
      toast.success(done);
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return {
    pending: mutation.isPending,
    run: (raw: unknown, onDone?: () => void) => {
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        toast.error(issue ? `${issue.path.join('.')}: ${issue.message}` : 'Check the form');
        return;
      }
      mutation.mutate(parsed.data, { onSuccess: () => onDone?.() });
    },
  };
}

function useFaculty() {
  return useQuery({
    queryKey: ['admin', 'users', 'faculty-list'],
    queryFn: () => api.admin.users({ role: 'faculty' }),
  });
}

function Departments() {
  const { data, isPending } = useQuery({
    queryKey: ['admin', 'departments'],
    queryFn: api.admin.departments,
  });
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const create = useCreate(
    createDepartmentSchema,
    api.admin.createDepartment,
    'Department created with its notices channel, faculty lounge and CR council',
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.run({ code, name }, () => {
      setCode('');
      setName('');
    });
  };

  return (
    <Card
      title="Departments"
      description="Each department gets a notices channel, a faculty lounge and a CR council."
    >
      {isPending ? (
        <div className="p-5">
          <Spinner />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th className="text-right">People</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((d) => (
              <tr key={d.id}>
                <td className="font-medium">{d.code}</td>
                <td>{d.name}</td>
                <td className="text-right tabular-nums">{d.userCount}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <form
        onSubmit={submit}
        className="grid gap-3 border-t p-4 sm:grid-cols-[110px_1fr_auto] sm:items-end"
      >
        <Field label="Code" htmlFor="dept-code">
          <Input
            id="dept-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="SE"
          />
        </Field>
        <Field label="Name" htmlFor="dept-name">
          <Input
            id="dept-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Department of Software Engineering"
          />
        </Field>
        <Button type="submit" loading={create.pending}>
          <Plus /> Add
        </Button>
      </form>
    </Card>
  );
}

function Sections() {
  const qc = useQueryClient();
  const sections = useQuery({ queryKey: ['admin', 'sections'], queryFn: api.admin.sections });
  const departments = useQuery({
    queryKey: ['admin', 'departments'],
    queryFn: api.admin.departments,
  });
  const faculty = useFaculty();
  const [form, setForm] = useState({
    departmentId: '',
    program: '',
    intake: '',
    name: '',
    batchAdvisorId: '',
  });
  const create = useCreate(
    createSectionSchema,
    api.admin.createSection,
    'Section created with its class group',
  );
  const setAdvisor = useMutation({
    mutationFn: ({ id, advisor }: { id: string; advisor: string | null }) =>
      api.admin.setAdvisor(id, advisor),
    onSuccess: () => {
      toast.success('Batch advisor updated. They now moderate the class group.');
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.run({ ...form, batchAdvisorId: form.batchAdvisorId || null }, () =>
      setForm({
        departmentId: form.departmentId,
        program: '',
        intake: '',
        name: '',
        batchAdvisorId: '',
      }),
    );
  };

  return (
    <Card
      title="Sections"
      description="Students belong to one section; its batch advisor moderates the class group."
    >
      {sections.isPending ? (
        <div className="p-5">
          <Spinner />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Section</th>
              <th>Department</th>
              <th>Intake</th>
              <th>Batch advisor</th>
              <th className="text-right">Students</th>
            </tr>
          </thead>
          <tbody>
            {sections.data?.map((s) => (
              <tr key={s.id}>
                <td className="font-medium">{s.name}</td>
                <td>{s.departmentCode}</td>
                <td>{s.intake}</td>
                <td>
                  <Select
                    aria-label={`Batch advisor of ${s.name}`}
                    value={s.batchAdvisor?.id ?? ''}
                    onChange={(e) =>
                      setAdvisor.mutate({ id: s.id, advisor: e.target.value || null })
                    }
                    className="h-8 min-w-48"
                  >
                    <option value="">No advisor</option>
                    {faculty.data?.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.departmentCode})
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="text-right tabular-nums">{s.studentCount}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <form
        onSubmit={submit}
        className="grid gap-3 border-t p-4 sm:grid-cols-3 lg:grid-cols-[1fr_90px_90px_110px_1fr_auto] lg:items-end"
      >
        <Field label="Department" htmlFor="sec-dept">
          <Select
            id="sec-dept"
            value={form.departmentId}
            onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
          >
            <option value="">Select…</option>
            {departments.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Program" htmlFor="sec-program">
          <Input
            id="sec-program"
            value={form.program}
            onChange={(e) => setForm({ ...form, program: e.target.value })}
            placeholder="BCS"
          />
        </Field>
        <Field label="Intake" htmlFor="sec-intake">
          <Input
            id="sec-intake"
            value={form.intake}
            onChange={(e) => setForm({ ...form, intake: e.target.value })}
            placeholder="FA25"
          />
        </Field>
        <Field label="Name" htmlFor="sec-name">
          <Input
            id="sec-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="BCS-1A"
          />
        </Field>
        <Field label="Batch advisor" htmlFor="sec-advisor">
          <Select
            id="sec-advisor"
            value={form.batchAdvisorId}
            onChange={(e) => setForm({ ...form, batchAdvisorId: e.target.value })}
          >
            <option value="">None</option>
            {faculty.data?.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" loading={create.pending}>
          <Plus /> Add
        </Button>
      </form>
    </Card>
  );
}

function Courses() {
  const courses = useQuery({ queryKey: ['admin', 'courses'], queryFn: api.admin.courses });
  const sections = useQuery({ queryKey: ['admin', 'sections'], queryFn: api.admin.sections });
  const faculty = useFaculty();
  const [form, setForm] = useState({ code: '', title: '', sectionId: '', instructorId: '' });
  const create = useCreate(
    createCourseSchema,
    api.admin.createCourse,
    'Course created; its instructor and the section’s students were added to the course group',
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.run(form, () =>
      setForm({ code: '', title: '', sectionId: form.sectionId, instructorId: '' }),
    );
  };

  return (
    <Card
      title="Course offerings"
      description="Each offering gets a course group: the instructor owns it, enrolled students join automatically."
    >
      {courses.isPending ? (
        <div className="p-5">
          <Spinner />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Course</th>
              <th>Section</th>
              <th>Instructor</th>
              <th className="text-right">Students</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {courses.data?.map((c) => (
              <tr key={c.id}>
                <td>
                  <span className="font-medium">{c.code}</span>{' '}
                  <span className="text-muted-foreground">{c.title}</span>
                </td>
                <td>{c.sectionName}</td>
                <td>{c.instructor?.name ?? '—'}</td>
                <td className="text-right tabular-nums">{c.studentCount}</td>
                <td className="text-right">
                  {c.groupId && (
                    <Link
                      to={`/admin/groups?focus=${c.groupId}`}
                      className="text-xs text-primary hover:underline"
                    >
                      Group
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <form
        onSubmit={submit}
        className="grid gap-3 border-t p-4 sm:grid-cols-2 lg:grid-cols-[110px_1fr_140px_1fr_auto] lg:items-end"
      >
        <Field label="Code" htmlFor="course-code">
          <Input
            id="course-code"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            placeholder="CSC101"
          />
        </Field>
        <Field label="Title" htmlFor="course-title">
          <Input
            id="course-title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Programming Fundamentals"
          />
        </Field>
        <Field label="Section" htmlFor="course-section">
          <Select
            id="course-section"
            value={form.sectionId}
            onChange={(e) => setForm({ ...form, sectionId: e.target.value })}
          >
            <option value="">Select…</option>
            {sections.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Instructor" htmlFor="course-instructor">
          <Select
            id="course-instructor"
            value={form.instructorId}
            onChange={(e) => setForm({ ...form, instructorId: e.target.value })}
          >
            <option value="">Select…</option>
            {faculty.data?.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.departmentCode})
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" loading={create.pending}>
          <Plus /> Add
        </Button>
      </form>
    </Card>
  );
}

export default function StructurePage() {
  return (
    <>
      <PageHeader
        title="University structure"
        description="The source of truth for official groups. Creating structure provisions groups and memberships automatically."
      />
      <div className="grid gap-6">
        <Departments />
        <Sections />
        <Courses />
      </div>
    </>
  );
}
