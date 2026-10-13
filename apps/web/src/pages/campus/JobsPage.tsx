import {
  addDays,
  campusClock,
  formatShortDate,
  JOB_KIND_LABELS,
  JOB_KINDS,
  type JobDTO,
  type JobKind,
  jobSchema,
} from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import {
  Bookmark,
  BookmarkCheck,
  Briefcase,
  Ellipsis,
  ExternalLink,
  Mail,
  MapPin,
  Pencil,
  Plus,
  Search,
  XCircle,
} from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useSearchParams } from 'react-router';
import { EmptyState, Spinner } from '@/components/feedback';
import { Card, PageHeader, Tabs } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/menu';
import { useAction, useSubmit } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { cn } from '@/lib/utils';

type Tab = 'open' | 'saved' | 'closed';

const daysUntil = (date: string) =>
  Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${campusClock().date}T00:00:00Z`)) / 86_400_000,
  );

function deadlineText(job: JobDTO): string {
  if (job.closed) return `Closed (deadline ${formatShortDate(job.deadline)})`;
  const days = daysUntil(job.deadline);
  return `Apply by ${formatShortDate(job.deadline)} (${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `${days} days left`})`;
}

function JobDialog({ job, onClose }: { job: JobDTO | null; onClose: () => void }) {
  const [form, setForm] = useState({
    title: job?.title ?? '',
    company: job?.company ?? '',
    kind: (job?.kind ?? 'internship') as JobKind,
    location: job?.location ?? '',
    description: job?.description ?? '',
    applyUrl: job?.applyUrl ?? '',
    applyEmail: job?.applyEmail ?? '',
    deadline: job?.deadline ?? addDays(campusClock().date, 14),
    programs: job?.programs.join(', ') ?? '',
  });
  const set = (field: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));
  const save = useSubmit(jobSchema, (input) => api.campus.saveJob(input, job?.id), {
    done: job ? 'Job updated' : 'Job posted. Students of those programmes were told.',
    invalidate: [keys.jobs],
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.run(
      {
        ...form,
        applyUrl: form.applyUrl.trim() || null,
        applyEmail: form.applyEmail.trim() || null,
        programs: form.programs
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean),
      },
      onClose,
    );
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent wide title={job ? `Edit ${job.title}` : 'Post a job'}>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Role" htmlFor="job-title">
              <Input id="job-title" value={form.title} onChange={set('title')} />
            </Field>
            <Field label="Company" htmlFor="job-company">
              <Input id="job-company" value={form.company} onChange={set('company')} />
            </Field>
            <Field label="Kind" htmlFor="job-kind">
              <Select id="job-kind" value={form.kind} onChange={set('kind')}>
                {JOB_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {JOB_KIND_LABELS[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Where" htmlFor="job-location">
              <Input
                id="job-location"
                value={form.location}
                onChange={set('location')}
                placeholder="e.g. Islamabad, on site"
              />
            </Field>
            <Field label="Apply link" htmlFor="job-url" hint="https://… (or give an email)">
              <Input id="job-url" value={form.applyUrl} onChange={set('applyUrl')} />
            </Field>
            <Field label="Apply by email" htmlFor="job-email">
              <Input
                id="job-email"
                type="email"
                value={form.applyEmail}
                onChange={set('applyEmail')}
              />
            </Field>
            <Field label="Deadline" htmlFor="job-deadline">
              <Input
                id="job-deadline"
                type="date"
                value={form.deadline}
                onChange={set('deadline')}
              />
            </Field>
            <Field
              label="For programmes"
              htmlFor="job-programs"
              hint="e.g. BCS, BSE (their students are told). Empty: everyone."
            >
              <Input id="job-programs" value={form.programs} onChange={set('programs')} />
            </Field>
          </div>
          <Field label="About the role" htmlFor="job-description">
            <Textarea
              id="job-description"
              rows={4}
              value={form.description}
              onChange={set('description')}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.pending}>
              {job ? 'Save changes' : 'Post job'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function JobCard({
  job,
  canManage,
  onEdit,
}: {
  job: JobDTO;
  canManage: boolean;
  onEdit: (job: JobDTO) => void;
}) {
  const save = useAction((saved: boolean) => api.campus.setJobSaved(job.id, saved), {
    done: (j) =>
      j.saved ? 'Saved. You will be reminded before the deadline.' : 'Removed from saved',
    invalidate: [keys.jobs],
  });
  const close = useAction(() => api.campus.closeJob(job.id), {
    done: 'Job closed',
    invalidate: [keys.jobs],
  });
  const soon = !job.closed && daysUntil(job.deadline) <= 3;
  return (
    <li className="px-4 py-4">
      <div className="flex items-start gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary dark:text-link"
          aria-hidden
        >
          <Briefcase className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-bold">{job.title}</span>
            <Badge tone="neutral">{JOB_KIND_LABELS[job.kind]}</Badge>
            {job.programs.length > 0 && <Badge tone="outline">For {job.programs.join(', ')}</Badge>}
          </p>
          <p className="flex flex-wrap gap-x-3 text-[13px] text-muted-foreground">
            <span className="font-semibold text-foreground">{job.company}</span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden /> {job.location}
            </span>
          </p>
          <p
            className={cn(
              'mt-0.5 text-[12.5px]',
              soon ? 'font-semibold text-warning' : 'text-muted-foreground',
            )}
          >
            {deadlineText(job)}
          </p>
          <p className="mt-2 text-[13.5px] whitespace-pre-line">{job.description}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!job.closed && job.applyUrl && (
              <a
                href={job.applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ size: 'sm' })}
              >
                <ExternalLink /> Apply
              </a>
            )}
            {!job.closed && job.applyEmail && (
              <a
                href={`mailto:${job.applyEmail}?subject=${encodeURIComponent(`Application: ${job.title}`)}`}
                className={buttonVariants({
                  size: 'sm',
                  variant: job.applyUrl ? 'outline' : 'primary',
                })}
              >
                <Mail /> Email {job.applyEmail}
              </a>
            )}
            <Button
              size="sm"
              variant="outline"
              aria-pressed={job.saved}
              aria-label={job.saved ? `Saved: ${job.title}` : `Save ${job.title}`}
              loading={save.isPending}
              onClick={() => save.mutate(!job.saved)}
            >
              {job.saved ? <BookmarkCheck /> : <Bookmark />} {job.saved ? 'Saved' : 'Save'}
            </Button>
          </div>
        </div>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${job.title}`}>
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => onEdit(job)}>
                <Pencil /> Edit
              </DropdownMenuItem>
              {!job.closed && (
                <DropdownMenuItem danger onSelect={() => close.mutate(undefined)}>
                  <XCircle /> Close now
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </li>
  );
}

/** Internships, part-time work, graduate jobs and research posts, from Student Affairs. */
export default function JobsPage() {
  const query = useQuery({ queryKey: keys.jobs, queryFn: api.campus.jobs });
  const [params, setParams] = useSearchParams();
  const tab = (
    ['saved', 'closed'].includes(params.get('tab') ?? '') ? params.get('tab') : 'open'
  ) as Tab;
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<JobDTO | 'new' | null>(null);
  const data = query.data;
  const needle = q.trim().toLowerCase();
  const list = (data?.[tab] ?? []).filter(
    (j) =>
      (!kind || j.kind === kind) &&
      (!needle || `${j.title} ${j.company} ${j.location}`.toLowerCase().includes(needle)),
  );
  return (
    <>
      <PageHeader
        title="Jobs and internships"
        description="Posted by Student Affairs. Save a post and you'll be reminded two days before it closes."
        actions={
          data?.canManage && (
            <Button onClick={() => setEditing('new')}>
              <Plus /> Post a job
            </Button>
          )
        }
      />
      <Tabs
        label="Jobs"
        value={tab}
        onChange={(value) => setParams(value === 'open' ? {} : { tab: value }, { replace: true })}
        options={[
          { value: 'open', label: 'Open', count: data?.open.length },
          { value: 'saved', label: 'Saved', count: data?.saved.length },
          ...(data?.canManage
            ? [{ value: 'closed' as const, label: 'Closed', count: data.closed.length }]
            : []),
        ]}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-60 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Search jobs"
            placeholder="Role, company or place"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select
          aria-label="Kind of job"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="w-auto"
        >
          <option value="">All kinds</option>
          {JOB_KINDS.map((k) => (
            <option key={k} value={k}>
              {JOB_KIND_LABELS[k]}
            </option>
          ))}
        </Select>
      </div>
      {!data ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !list.length ? (
        <EmptyState icon={Briefcase} title="No jobs here" className="rounded-lg border bg-surface">
          {tab === 'saved'
            ? 'Save posts to keep them here.'
            : 'New posts appear here as Student Affairs add them.'}
        </EmptyState>
      ) : (
        <Card>
          <ul className="divide-y">
            {list.map((job) => (
              <JobCard key={job.id} job={job} canManage={data.canManage} onEdit={setEditing} />
            ))}
          </ul>
        </Card>
      )}
      {editing && (
        <JobDialog job={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}
