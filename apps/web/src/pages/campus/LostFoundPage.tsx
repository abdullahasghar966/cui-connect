import {
  campusClock,
  type FileDTO,
  formatShortDate,
  ITEM_CATEGORIES,
  ITEM_CATEGORY_LABELS,
  type ItemCategory,
  type LostFoundKind,
  type LostItemDTO,
  lostItemSchema,
} from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { ImagePlus, PackageSearch, Plus, X } from 'lucide-react';
import { type ChangeEvent, type FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, Spinner } from '@/components/feedback';
import { PageHeader, Tabs } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { errorMessage, useSubmit } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { cn } from '@/lib/utils';

type Tab = 'open' | 'mine' | 'returned';

export function KindBadge({ kind }: { kind: LostFoundKind }) {
  return kind === 'lost' ? <Badge tone="warning">Lost</Badge> : <Badge tone="success">Found</Badge>;
}

/** One photo, uploaded as soon as it is picked (images only, like the server checks). */
function PhotoPicker({
  photo,
  onChange,
}: {
  photo: FileDTO | null;
  onChange: (photo: FileDTO | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      onChange(await api.files.upload(file, 'lostfound'));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  if (photo) {
    return (
      <div className="flex items-center gap-3">
        <img src={photo.url} alt="" className="size-20 rounded-md border object-cover" />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void api.files.discard(photo.id).catch(() => {});
            onChange(null);
          }}
        >
          <X /> Remove photo
        </Button>
      </div>
    );
  }
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 py-4 text-[13px] text-muted-foreground hover:bg-surface-2',
        busy && 'pointer-events-none opacity-60',
      )}
    >
      <ImagePlus className="size-4" aria-hidden />
      {busy ? 'Uploading…' : 'Add a photo (optional)'}
      <input type="file" accept="image/*" className="sr-only" onChange={pick} />
    </label>
  );
}

function ReportDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    kind: 'lost' as LostFoundKind,
    title: '',
    category: 'electronics' as ItemCategory,
    place: '',
    date: campusClock().date,
    description: '',
  });
  const [photo, setPhoto] = useState<FileDTO | null>(null);
  const set = (field: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));
  const report = useSubmit(lostItemSchema, (input) => api.campus.reportItem(input), {
    done: 'Reported. People who answer are passed to you.',
    invalidate: [keys.lostFound],
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    report.run(
      { ...form, description: form.description.trim() || null, photoId: photo?.id ?? null },
      (item) => {
        onClose();
        navigate(`/campus/lost-found/${item.id}`);
      },
    );
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Report an item"
        description="Don't put phone numbers here: answers come to you in CUI Connect, and handovers happen at Student Affairs."
      >
        <form onSubmit={submit} className="space-y-3">
          <div role="radiogroup" aria-label="Lost or found" className="grid grid-cols-2 gap-2">
            {(['lost', 'found'] as const).map((kind) => (
              <label
                key={kind}
                className={cn(
                  'cursor-pointer rounded-md border px-3 py-2 text-center text-[13.5px] font-semibold',
                  form.kind === kind ? 'border-primary bg-primary-soft' : 'hover:bg-surface-2',
                )}
              >
                <input
                  type="radio"
                  name="lost-kind"
                  className="sr-only"
                  checked={form.kind === kind}
                  onChange={() => setForm((f) => ({ ...f, kind }))}
                />
                {kind === 'lost' ? 'I lost something' : 'I found something'}
              </label>
            ))}
          </div>
          <Field label="What is it?" htmlFor="lost-title">
            <Input
              id="lost-title"
              value={form.title}
              onChange={set('title')}
              placeholder="e.g. Blue steel water bottle"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kind of thing" htmlFor="lost-category">
              <Select id="lost-category" value={form.category} onChange={set('category')}>
                {ITEM_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {ITEM_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="When" htmlFor="lost-date">
              <Input
                id="lost-date"
                type="date"
                max={campusClock().date}
                value={form.date}
                onChange={set('date')}
              />
            </Field>
          </div>
          <Field label="Where" htmlFor="lost-place">
            <Input
              id="lost-place"
              value={form.place}
              onChange={set('place')}
              placeholder="e.g. Cafeteria"
            />
          </Field>
          <Field
            label="Details (optional)"
            htmlFor="lost-description"
            hint="Leave out a detail only the owner would know, so you can check answers."
          >
            <Textarea
              id="lost-description"
              rows={2}
              value={form.description}
              onChange={set('description')}
            />
          </Field>
          <PhotoPicker photo={photo} onChange={setPhoto} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={report.pending}>
              Report
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ItemCard({ item }: { item: LostItemDTO }) {
  return (
    <li>
      <Link
        to={`/campus/lost-found/${item.id}`}
        className="flex h-full flex-col overflow-hidden rounded-lg border bg-surface hover:border-border-strong"
      >
        {item.photo ? (
          <img
            src={item.photo.url}
            alt={item.title}
            className="aspect-video w-full object-cover"
            loading="lazy"
          />
        ) : (
          <span
            className="flex aspect-video w-full items-center justify-center bg-surface-2 text-muted-foreground"
            aria-hidden
          >
            <PackageSearch className="size-8" />
          </span>
        )}
        <span className="flex flex-1 flex-col gap-1 px-3 py-2.5">
          <span className="flex flex-wrap items-center gap-1.5">
            <KindBadge kind={item.kind} />
            {item.resolved && <Badge tone="outline">Returned</Badge>}
          </span>
          <span className="text-[14px] font-bold">{item.title}</span>
          <span className="text-[12.5px] text-muted-foreground">
            {item.place} · {formatShortDate(item.date)}
          </span>
          <span className="mt-auto text-[12px] text-muted-foreground">
            By {item.reporter.name}
            {item.claimCount
              ? ` · ${item.claimCount} answer${item.claimCount === 1 ? '' : 's'}`
              : ''}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** Things lost and found on campus, with photos; answers go to whoever reported them. */
export default function LostFoundPage() {
  const query = useQuery({ queryKey: keys.lostFound, queryFn: api.campus.lostFound });
  const [params, setParams] = useSearchParams();
  const tab = (
    ['mine', 'returned'].includes(params.get('tab') ?? '') ? params.get('tab') : 'open'
  ) as Tab;
  const [kind, setKind] = useState('');
  const [reporting, setReporting] = useState(false);
  const data = query.data;
  const lists: Record<Tab, LostItemDTO[]> = {
    open: data?.items ?? [],
    mine: data?.mine ?? [],
    returned: data?.resolved ?? [],
  };
  const shown = lists[tab].filter((i) => !kind || i.kind === kind);
  return (
    <>
      <PageHeader
        title="Lost & found"
        description="Lost something, or found something? Report it, with a photo if you can. Answers go to whoever reported it; Student Affairs keep found items."
        actions={
          <Button onClick={() => setReporting(true)}>
            <Plus /> Report an item
          </Button>
        }
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Tabs
          label="Lost and found"
          value={tab}
          onChange={(value) => setParams(value === 'open' ? {} : { tab: value }, { replace: true })}
          options={[
            { value: 'open', label: 'Open', count: lists.open.length },
            { value: 'mine', label: 'My reports', count: lists.mine.length },
            { value: 'returned', label: 'Returned' },
          ]}
          className="mb-0 flex-1"
        />
        <Select
          aria-label="Lost or found"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="mb-3 w-auto"
        >
          <option value="">Lost and found</option>
          <option value="lost">Lost only</option>
          <option value="found">Found only</option>
        </Select>
      </div>
      {!data ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !shown.length ? (
        <EmptyState
          icon={PackageSearch}
          title="Nothing here"
          className="rounded-lg border bg-surface"
        >
          {tab === 'mine'
            ? 'Items you report appear here.'
            : 'Reports appear here as people add them.'}
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </ul>
      )}
      {reporting && <ReportDialog onClose={() => setReporting(false)} />}
    </>
  );
}
