import {
  type CatalogCourseDTO,
  type CsvImportResultDTO,
  catalogCourseSchema,
  formatCredits,
} from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Ellipsis, FileUp, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { EmptyState, Spinner } from '@/components/feedback';
import { Card, Table } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/menu';
import { useDebounced } from '@/hooks/useDebounced';
import { useAction, useSubmit } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';

export function useDepartments() {
  return useQuery({ queryKey: ['admin', 'departments'], queryFn: api.admin.departments });
}

const lines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

function CourseDialog({
  course,
  onClose,
}: {
  course: CatalogCourseDTO | 'new' | null;
  onClose: () => void;
}) {
  const editing = course && course !== 'new' ? course : null;
  const { data: departments } = useDepartments();
  const [form, setForm] = useState({
    code: editing?.code ?? '',
    title: editing?.title ?? '',
    departmentId: editing?.departmentId ?? '',
    credits: String(editing?.credits ?? 3),
    labCredits: String(editing?.labCredits ?? 0),
    prerequisites: editing?.prerequisites.join(' ') ?? '',
    description: editing?.description ?? '',
    clos: editing?.clos.map((c) => c.text).join('\n') ?? '',
    outline: editing?.outline.map((o) => o.topic).join('\n') ?? '',
  });
  const save = useSubmit(
    catalogCourseSchema,
    (input) => api.academics.saveCourse(input.code, input),
    {
      done: (c) => `${c.code} saved`,
      invalidate: [['academics'], ['admin']],
    },
  );
  const set = (field: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.run(
      {
        code: form.code,
        title: form.title,
        departmentId: form.departmentId || null,
        credits: Number(form.credits),
        labCredits: Number(form.labCredits || 0),
        prerequisites: form.prerequisites.split(/[\s,;]+/).filter(Boolean),
        description: form.description.trim() || null,
        clos: lines(form.clos).map((text, i) => ({ code: `CLO${i + 1}`, text })),
        outline: lines(form.outline).map((topic, i) => ({ week: i + 1, topic })),
      },
      onClose,
    );
  };

  return (
    <Dialog open={!!course} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        wide
        title={editing ? `Edit ${editing.code}` : 'Add a course to the catalog'}
        description="The catalog says what a course is. Sections take it as course offerings."
      >
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-6">
          <Field label="Code" htmlFor="cat-code" className="sm:col-span-2">
            <Input
              id="cat-code"
              placeholder="CSC337"
              value={form.code}
              disabled={!!editing}
              onChange={set('code')}
            />
          </Field>
          <Field label="Title" htmlFor="cat-title" className="sm:col-span-4">
            <Input
              id="cat-title"
              placeholder="Advanced Web Technologies"
              value={form.title}
              onChange={set('title')}
            />
          </Field>
          <Field label="Department" htmlFor="cat-dept" className="sm:col-span-2">
            <Select id="cat-dept" value={form.departmentId} onChange={set('departmentId')}>
              <option value="">Campus-wide</option>
              {departments?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} · {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Credit hours" htmlFor="cat-credits">
            <Input
              id="cat-credits"
              inputMode="numeric"
              value={form.credits}
              onChange={set('credits')}
            />
          </Field>
          <Field label="Of which lab" htmlFor="cat-lab">
            <Input
              id="cat-lab"
              inputMode="numeric"
              value={form.labCredits}
              onChange={set('labCredits')}
            />
          </Field>
          <Field
            label="Prerequisites"
            htmlFor="cat-pre"
            hint="Course codes, e.g. CSC336"
            className="sm:col-span-2"
          >
            <Input id="cat-pre" value={form.prerequisites} onChange={set('prerequisites')} />
          </Field>
          <Field label="Description" htmlFor="cat-desc" className="sm:col-span-6">
            <Textarea
              id="cat-desc"
              rows={3}
              value={form.description}
              onChange={set('description')}
            />
          </Field>
          <Field
            label="Learning outcomes (CLOs)"
            htmlFor="cat-clos"
            hint="One per line"
            className="sm:col-span-3"
          >
            <Textarea id="cat-clos" rows={5} value={form.clos} onChange={set('clos')} />
          </Field>
          <Field
            label="Weekly outline"
            htmlFor="cat-outline"
            hint="One topic per line: line 1 is week 1"
            className="sm:col-span-3"
          >
            <Textarea id="cat-outline" rows={5} value={form.outline} onChange={set('outline')} />
          </Field>
          <div className="flex justify-end gap-2 sm:col-span-6">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.pending}>
              {editing ? 'Save changes' : 'Add course'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const CSV_EXAMPLE = `code,title,department,credits,labCredits,prerequisites,description
CSC337,Advanced Web Technologies,CS,3,1,CSC336,Full-stack and real-time web
CSC441,Compiler Construction,CS,3,0,CSC312,`;

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState<CsvImportResultDTO | null>(null);
  const run = useAction((text: string) => api.academics.importCatalog(text), {
    done: (r) => `${r.created} course${r.created === 1 ? '' : 's'} imported`,
    invalidate: [['academics'], ['admin']],
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setCsv('');
          setResult(null);
          onClose();
        }
      }}
    >
      <DialogContent
        wide
        title="Import courses from CSV"
        description="Adds new courses and updates existing ones with the same code. Prerequisites are separated by spaces."
      >
        <div className="space-y-3">
          <Textarea
            aria-label="CSV"
            rows={8}
            className="font-mono text-[12.5px]"
            placeholder={CSV_EXAMPLE}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
          />
          {result && (
            <div className="rounded-md border bg-surface-2 p-3 text-[13px]">
              <p className="font-semibold">
                {result.created} imported, {result.errors.length} skipped
              </p>
              {result.errors.slice(0, 8).map((e) => (
                <p key={e.line} className="text-danger">
                  Line {e.line}: {e.message}
                </p>
              ))}
            </div>
          )}
          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={() => setCsv(CSV_EXAMPLE)}>
              Use example
            </Button>
            <Button
              loading={run.isPending}
              disabled={!csv.trim()}
              onClick={() => run.mutate(csv, { onSuccess: setResult })}
            >
              Import
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CatalogSection() {
  const [q, setQ] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const search = useDebounced(q.trim(), 250);
  const { data: departments } = useDepartments();
  const { data: courses, isPending } = useQuery({
    queryKey: keys.catalog(search, departmentId),
    queryFn: () => api.academics.catalog({ q: search, departmentId: departmentId || undefined }),
  });
  const [editing, setEditing] = useState<CatalogCourseDTO | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const remove = useAction((c: CatalogCourseDTO) => api.academics.deleteCourse(c.code), {
    done: 'Course removed from the catalog',
    invalidate: [['academics'], ['admin']],
  });

  return (
    <Card
      title={courses ? `Catalog · ${courses.length} courses` : 'Catalog'}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setImporting(true)}>
            <FileUp /> Import CSV
          </Button>
          <Button onClick={() => setEditing('new')}>
            <Plus /> Add course
          </Button>
        </div>
      }
    >
      <div className="flex flex-wrap gap-2 border-b px-4 py-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search the catalog"
            placeholder="Code or title"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select
          aria-label="Department"
          className="w-auto"
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
        >
          <option value="">All departments</option>
          {departments?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.code}
            </option>
          ))}
        </Select>
      </div>
      {isPending ? (
        <div className="p-5">
          <Spinner />
        </div>
      ) : !courses?.length ? (
        <EmptyState icon={BookOpen} title={search ? 'No courses match' : 'The catalog is empty'}>
          {!search && 'Add courses one by one or import a CSV. Course offerings add themselves.'}
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Course</th>
              <th>Dept</th>
              <th>Credits</th>
              <th>Prerequisites</th>
              <th className="text-right">This term</th>
              <th className="w-10">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.code}>
                <td>
                  <span className="font-mono text-[12.5px] text-muted-foreground">{c.code}</span>{' '}
                  <span className="font-semibold">{c.title}</span>
                </td>
                <td className="text-muted-foreground">{c.departmentCode ?? '—'}</td>
                <td className="font-mono text-[12.5px] whitespace-nowrap">
                  {formatCredits(c.credits, c.labCredits)}
                </td>
                <td className="font-mono text-[12.5px] text-muted-foreground">
                  {c.prerequisites.join(', ') || '—'}
                </td>
                <td className="text-right">
                  {c.offeredSections ? (
                    <Badge tone="primary">
                      {c.offeredSections} section{c.offeredSections === 1 ? '' : 's'}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${c.code}`}>
                        <Ellipsis />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onSelect={() => setEditing(c)}>
                        <Pencil /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem danger onSelect={() => remove.mutate(c)}>
                        <Trash2 /> Remove from catalog
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {editing && (
        <CourseDialog
          key={editing === 'new' ? 'new' : editing.code}
          course={editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ImportDialog open={importing} onClose={() => setImporting(false)} />
    </Card>
  );
}
