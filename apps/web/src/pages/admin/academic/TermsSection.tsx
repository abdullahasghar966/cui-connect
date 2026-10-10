import {
  createTermSchema,
  defaultTermDates,
  nextTermCode,
  type TermDTO,
  termCodeFor,
  termIndex,
  termName,
} from '@cui/shared';
import { CalendarRange } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { EmptyState, Spinner } from '@/components/feedback';
import { Card, Table } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/form';
import { useTerms } from '@/hooks/academics';
import { useAction, useSubmit } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';

const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const formatDate = (date: string) => dateFormat.format(new Date(`${date}T00:00:00Z`));

function suggestedNext(terms: TermDTO[]): string {
  const latest = [...terms].sort((a, b) => termIndex(b.code) - termIndex(a.code))[0];
  return latest ? nextTermCode(latest.code) : termCodeFor(new Date().toISOString().slice(0, 10));
}

function AddTermForm({ terms }: { terms: TermDTO[] }) {
  const initial = suggestedNext(terms);
  const [code, setCode] = useState(initial);
  const [dates, setDates] = useState(defaultTermDates(initial));
  const create = useSubmit(createTermSchema, api.admin.createTerm, {
    done: (t) => `${t.name} added`,
    invalidate: [keys.terms, ['admin']],
  });

  const changeCode = (value: string) => {
    const upper = value.toUpperCase();
    setCode(upper);
    if (/^(FA|SP)\d{2}$/.test(upper)) setDates(defaultTermDates(upper));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.run({ code, ...dates }, (t) => changeCode(nextTermCode(t.code)));
  };

  return (
    <form onSubmit={submit} className="grid gap-3 border-t p-4 sm:grid-cols-[120px_1fr_1fr_auto]">
      <Field
        label="Code"
        htmlFor="term-code"
        hint={/^(FA|SP)\d{2}$/.test(code) ? termName(code) : 'FA26 or SP27'}
      >
        <Input id="term-code" value={code} onChange={(e) => changeCode(e.target.value)} />
      </Field>
      <Field label="Teaching starts" htmlFor="term-start">
        <Input
          id="term-start"
          type="date"
          value={dates.startsOn}
          onChange={(e) => setDates((d) => ({ ...d, startsOn: e.target.value }))}
        />
      </Field>
      <Field label="Term ends" htmlFor="term-end">
        <Input
          id="term-end"
          type="date"
          value={dates.endsOn}
          onChange={(e) => setDates((d) => ({ ...d, endsOn: e.target.value }))}
        />
      </Field>
      <Button type="submit" className="self-end sm:mb-[22px]" loading={create.pending}>
        Add term
      </Button>
    </form>
  );
}

export function TermsSection() {
  const { data: terms, isPending } = useTerms();
  const [confirm, setConfirm] = useState<TermDTO | null>(null);
  const makeCurrent = useAction((t: TermDTO) => api.admin.setCurrentTerm(t.id), {
    done: (t) => `${t.name} is now the current term`,
    invalidate: [['academics'], ['admin']],
  });

  return (
    <Card
      title="Terms"
      description="Semesters. The current term decides which courses, timetable, attendance and marks everyone sees."
    >
      {isPending ? (
        <div className="p-5">
          <Spinner />
        </div>
      ) : !terms?.length ? (
        <EmptyState icon={CalendarRange} title="No terms yet" />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Term</th>
              <th>Teaching dates</th>
              <th className="text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {terms.map((t) => (
              <tr key={t.id}>
                <td>
                  <span className="font-semibold">{t.name}</span>{' '}
                  <span className="text-muted-foreground">{t.code}</span>
                </td>
                <td className="text-muted-foreground">
                  {formatDate(t.startsOn)} – {formatDate(t.endsOn)}
                </td>
                <td className="text-right">
                  {t.current ? (
                    <Badge tone="success">Current</Badge>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setConfirm(t)}>
                      Make current
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {terms && <AddTermForm terms={terms} />}

      <Dialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent
          title={`Start ${confirm?.name ?? ''}?`}
          description="Course lists, timetables, attendance and marks switch to this term for everyone. Earlier terms stay in transcripts."
        >
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              loading={makeCurrent.isPending}
              onClick={() =>
                confirm && makeCurrent.mutate(confirm, { onSuccess: () => setConfirm(null) })
              }
            >
              Make current
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
