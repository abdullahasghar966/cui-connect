import { type ProgramDTO, programSchema } from '@cui/shared';
import { GraduationCap, Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { EmptyState, Spinner } from '@/components/feedback';
import { Card } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { usePrograms } from '@/hooks/academics';
import { useAction, useSubmit } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { useDepartments } from './CatalogSection';

function ProgramDialog({
  program,
  onClose,
}: {
  program: ProgramDTO | 'new' | null;
  onClose: () => void;
}) {
  const editing = program && program !== 'new' ? program : null;
  const { data: departments } = useDepartments();
  const [form, setForm] = useState({
    code: editing?.code ?? '',
    name: editing?.name ?? '',
    departmentId: editing?.departmentId ?? '',
    totalCredits: String(editing?.totalCredits ?? 130),
    plan: editing?.plan.map((p) => p.courses.join(' ')).join('\n') ?? '',
  });
  const save = useSubmit(programSchema, (input) => api.academics.saveProgram(input.code, input), {
    done: (p) => `${p.code} saved`,
    invalidate: [keys.programs, ['admin']],
  });
  const set = (field: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.run(
      {
        code: form.code,
        name: form.name,
        departmentId: form.departmentId,
        totalCredits: Number(form.totalCredits),
        plan: form.plan
          .split('\n')
          .map((line, i) => ({
            semester: i + 1,
            courses: line.split(/[\s,;]+/).filter(Boolean),
          }))
          .filter((p) => p.courses.length),
      },
      onClose,
    );
  };

  return (
    <Dialog open={!!program} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        wide
        title={editing ? `Edit ${editing.code}` : 'Add a degree programme'}
        description="The recommended courses per semester drive each student's degree progress."
      >
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-4">
          <Field label="Code" htmlFor="prog-code">
            <Input
              id="prog-code"
              placeholder="BCS"
              value={form.code}
              disabled={!!editing}
              onChange={set('code')}
            />
          </Field>
          <Field label="Name" htmlFor="prog-name" className="sm:col-span-3">
            <Input
              id="prog-name"
              placeholder="BS Computer Science"
              value={form.name}
              onChange={set('name')}
            />
          </Field>
          <Field label="Department" htmlFor="prog-dept" className="sm:col-span-3">
            <Select id="prog-dept" value={form.departmentId} onChange={set('departmentId')}>
              <option value="">Select…</option>
              {departments?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} · {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Total credits" htmlFor="prog-credits">
            <Input
              id="prog-credits"
              inputMode="numeric"
              value={form.totalCredits}
              onChange={set('totalCredits')}
            />
          </Field>
          <Field
            label="Plan"
            htmlFor="prog-plan"
            hint="One line per semester (line 1 = semester 1): course codes separated by spaces"
            className="sm:col-span-4"
          >
            <Textarea
              id="prog-plan"
              rows={8}
              className="font-mono text-[12.5px]"
              placeholder={'CSC101 CSC103 MTH104\nCSC241 CSC102 MTH105'}
              value={form.plan}
              onChange={set('plan')}
            />
          </Field>
          <div className="flex justify-end gap-2 sm:col-span-4">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.pending}>
              {editing ? 'Save changes' : 'Add programme'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ProgramsSection() {
  const { data: programs, isPending } = usePrograms();
  const [editing, setEditing] = useState<ProgramDTO | 'new' | null>(null);
  const remove = useAction((p: ProgramDTO) => api.academics.deleteProgram(p.code), {
    done: 'Programme removed',
    invalidate: [keys.programs, ['admin']],
  });

  return (
    <Card
      title="Degree programmes"
      description="Each programme's courses by semester (used for degree progress)."
      actions={
        <Button onClick={() => setEditing('new')}>
          <Plus /> Add programme
        </Button>
      }
    >
      {isPending ? (
        <div className="p-5">
          <Spinner />
        </div>
      ) : !programs?.length ? (
        <EmptyState icon={GraduationCap} title="No programmes yet" />
      ) : (
        <ul className="divide-y">
          {programs.map((p) => (
            <li key={p.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[12.5px] text-muted-foreground">{p.code}</span>
                <span className="font-semibold">{p.name}</span>
                <span className="text-[13px] text-muted-foreground">
                  {p.departmentCode} · {p.totalCredits} credits
                </span>
                <span className="ml-auto flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(p)}>
                    <Pencil /> Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${p.code}`}
                    onClick={() => remove.mutate(p)}
                  >
                    <Trash2 />
                  </Button>
                </span>
              </div>
              <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
                {p.plan
                  .filter((s) => s.courses.length)
                  .map((s) => (
                    <p key={s.semester} className="text-[12.5px]">
                      <span className="font-semibold">Sem {s.semester}:</span>{' '}
                      <span className="font-mono text-muted-foreground">{s.courses.join(' ')}</span>
                    </p>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <ProgramDialog
          key={editing === 'new' ? 'new' : editing.id}
          program={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}
