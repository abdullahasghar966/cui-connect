import { GROUP_TYPE_LABELS, type PublicUserDTO } from '@cui/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Compass, Search, UserRoundSearch } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, Spinner } from '@/components/feedback';
import { GroupIcon } from '@/components/group-meta';
import { Avatar, RoleBadge, roleLabel } from '@/components/people';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/form';
import { useCurrentUser } from '@/hooks/queries';
import { useDebounced } from '@/hooks/useDebounced';
import { api } from '@/lib/api';
import { keys, upsertGroup } from '@/lib/cache';
import { ACK_TIMEOUT_MS, getSocket, withAck } from '@/lib/socket';
import { useRealtime } from '@/state/realtime';

/** Opens (or creates) a DM thread; the server applies the DM boundary rules. */
export function useOpenDirect() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useCallback(
    async (userId: string) => {
      const res = await withAck(
        getSocket().timeout(ACK_TIMEOUT_MS).emitWithAck('dm:open', { userId }),
      );
      if (!res.ok) {
        toast.error(res.message);
        return false;
      }
      upsertGroup(qc, res.data);
      navigate(`/chat/${res.data.id}`);
      return true;
    },
    [qc, navigate],
  );
}

const DM_HINTS: Record<string, string> = {
  student:
    'You can message your instructors, batch advisor and HOD, classmates and department peers, fellow society members, and university offices.',
  faculty:
    'You can message colleagues, university offices, students of your department and students you teach.',
  staff: 'University offices can message anyone on campus.',
  admin: 'IT Services can message anyone on campus.',
};

function describePerson(person: PublicUserDTO): string {
  if (person.role === 'student')
    return [person.regNo, person.sectionName].filter(Boolean).join(' · ');
  if (person.role === 'faculty') {
    return [person.designation, person.departmentCode].filter(Boolean).join(' · ');
  }
  return person.designation ?? roleLabel(person);
}

export function NewMessageDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const me = useCurrentUser();
  const [q, setQ] = useState('');
  const debounced = useDebounced(q);
  const online = useRealtime((s) => s.online);
  const openDirect = useOpenDirect();
  const [opening, setOpening] = useState<string | null>(null);
  const { data, isFetching } = useQuery({
    queryKey: keys.directory(debounced),
    queryFn: () => api.directory(debounced),
    enabled: open,
  });

  const choose = async (person: PublicUserDTO) => {
    setOpening(person.id);
    const ok = await openDirect(person.id);
    setOpening(null);
    if (ok) {
      onOpenChange(false);
      setQ('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New message" description={DM_HINTS[me.role]}>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, email or registration number"
            aria-label="Search people"
            className="pl-8"
          />
          {isFetching && <Spinner className="absolute top-1/2 right-2.5 -translate-y-1/2" />}
        </div>
        <ul className="mt-3 max-h-[50vh] space-y-0.5 overflow-y-auto">
          {data?.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                onClick={() => void choose(person)}
                disabled={opening !== null}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-muted disabled:opacity-60"
              >
                <Avatar name={person.name} online={online.has(person.id)} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{person.name}</span>
                    <RoleBadge person={person} />
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {describePerson(person)}
                  </span>
                </span>
                {opening === person.id && <Spinner />}
              </button>
            </li>
          ))}
        </ul>
        {data && data.length === 0 && (
          <EmptyState icon={UserRoundSearch} title="No one to message" className="py-6">
            {q
              ? 'Nobody you are allowed to message matches your search.'
              : 'There is nobody you can message yet.'}
          </EmptyState>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DiscoverDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [joining, setJoining] = useState<string | null>(null);
  const { data, isPending } = useQuery({
    queryKey: keys.discover,
    queryFn: api.discover,
    enabled: open,
  });

  const join = async (groupId: string) => {
    setJoining(groupId);
    const res = await withAck(
      getSocket().timeout(ACK_TIMEOUT_MS).emitWithAck('group:join', { groupId }),
    );
    setJoining(null);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    upsertGroup(qc, res.data);
    void qc.invalidateQueries({ queryKey: keys.discover });
    onOpenChange(false);
    navigate(`/chat/${res.data.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Discover societies"
        description="Societies are open to every student and faculty member. Official groups are joined automatically from your section, courses and role."
      >
        {isPending ? (
          <Spinner />
        ) : data?.length ? (
          <ul className="space-y-2">
            {data.map((group) => (
              <li key={group.id} className="flex items-center gap-3 rounded-xl border p-3">
                <GroupIcon type={group.type} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{group.name}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {group.description ?? GROUP_TYPE_LABELS[group.type]} · {group.memberCount}{' '}
                    members
                  </p>
                </div>
                <Button
                  size="sm"
                  loading={joining === group.id}
                  onClick={() => void join(group.id)}
                >
                  Join
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={Compass} title="You're in every open society" className="py-6">
            New societies created by the administration will appear here.
          </EmptyState>
        )}
      </DialogContent>
    </Dialog>
  );
}
