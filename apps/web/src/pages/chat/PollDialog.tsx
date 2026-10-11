import { type GroupDTO, pollInputSchema } from '@cui/shared';
import { Plus, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Checkbox, Field, Input } from '@/components/ui/form';
import { useSendMessage } from '@/hooks/useChatActions';

const MAX_OPTIONS = 10;

/** Starts a poll in the current chat (sent like a message, so the same posting rules apply). */
export function PollDialog({
  group,
  open,
  onOpenChange,
}: {
  group: GroupDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const send = useSendMessage();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multiple, setMultiple] = useState(false);

  const reset = () => {
    setQuestion('');
    setOptions(['', '']);
    setMultiple(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = pollInputSchema.safeParse({
      question,
      options: options.map((o) => o.trim()).filter(Boolean),
      multiple,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Check the poll');
      return;
    }
    onOpenChange(false);
    reset();
    await send(group.id, parsed.data.question, undefined, parsed.data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Create a poll"
        description={`Everyone in ${group.type === 'DIRECT' ? 'this conversation' : group.name} can vote and sees the results live.`}
      >
        <form onSubmit={submit} className="space-y-3">
          <Field label="Question" htmlFor="poll-question">
            <Input
              id="poll-question"
              placeholder="e.g. When should we hold the review session?"
              value={question}
              maxLength={300}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </Field>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-[13px] font-semibold">Options</legend>
            {options.map((option, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: options are edited in place by position
              <div key={i} className="flex gap-2">
                <Input
                  aria-label={`Option ${i + 1}`}
                  placeholder={`Option ${i + 1}`}
                  value={option}
                  maxLength={100}
                  onChange={(e) =>
                    setOptions((list) => list.map((o, j) => (j === i ? e.target.value : o)))
                  }
                />
                {options.length > 2 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove option ${i + 1}`}
                    onClick={() => setOptions((list) => list.filter((_, j) => j !== i))}
                  >
                    <X />
                  </Button>
                )}
              </div>
            ))}
            {options.length < MAX_OPTIONS && (
              <Button variant="ghost" size="sm" onClick={() => setOptions((list) => [...list, ''])}>
                <Plus /> Add option
              </Button>
            )}
          </fieldset>
          <Checkbox
            label="Allow more than one answer"
            checked={multiple}
            onChange={(e) => setMultiple(e.target.checked)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Post poll</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
