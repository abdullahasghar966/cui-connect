import { campusSettingsSchema } from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useEffect, useState } from 'react';
import { Card } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { useSubmit } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';

/** Campus-wide academic rules (today: the attendance needed to sit the terminal exam). */
export function RulesSection() {
  const { data } = useQuery({ queryKey: keys.settings, queryFn: api.academics.settings });
  const [minimum, setMinimum] = useState('');
  useEffect(() => {
    if (data) setMinimum(String(data.minAttendance));
  }, [data]);
  const save = useSubmit(campusSettingsSchema, api.admin.updateSettings, {
    done: (s) => `Minimum attendance is now ${s.minAttendance}%`,
    invalidate: [keys.settings, keys.myAttendance, ['teaching']],
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.run({ minAttendance: Number(minimum) });
  };
  return (
    <Card
      title="Attendance rule"
      description="Students below this share of classes in a course are warned, and shown as short to their teachers."
    >
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3 p-4">
        <Field
          label="Minimum attendance (%)"
          htmlFor="min-attendance"
          hint="COMSATS uses 80%. A warning starts 5% above it."
        >
          <Input
            id="min-attendance"
            type="number"
            min={50}
            max={100}
            className="w-32"
            value={minimum}
            onChange={(e) => setMinimum(e.target.value)}
          />
        </Field>
        <Button
          type="submit"
          loading={save.pending}
          disabled={!data || minimum === String(data.minAttendance)}
        >
          Save
        </Button>
      </form>
    </Card>
  );
}
