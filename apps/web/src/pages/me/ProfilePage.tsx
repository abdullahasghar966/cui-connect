import { OFFICE_LABELS, type UserDTO } from '@cui/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, KeyRound, Trash2 } from 'lucide-react';
import { type ChangeEvent, useState } from 'react';
import { toast } from 'sonner';
import { ChangePasswordDialog } from '@/components/ChangePasswordDialog';
import { Card, PageHeader } from '@/components/page';
import { Avatar, roleLabel } from '@/components/people';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/queries';
import { errorMessage } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { cn } from '@/lib/utils';

function details(me: UserDTO): [string, string][] {
  const rows: [string, string | null][] = [
    ['Name', me.name],
    ['Email', me.email],
    ['Role', roleLabel(me)],
    ['Registration number', me.regNo],
    ['Section', me.sectionName],
    ['Department', me.departmentCode],
    ['Office', me.office ? OFFICE_LABELS[me.office] : null],
    ['Designation', me.role === 'student' ? null : me.designation],
  ];
  return rows.filter((r): r is [string, string] => !!r[1]);
}

/** Your photo (everyone sees it next to your name) and the details the university holds. */
export default function ProfilePage() {
  const me = useCurrentUser();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState(false);

  const apply = async (photoId: string | null, done: string) => {
    const user = await api.setProfilePhoto(photoId);
    qc.setQueryData(keys.me, user);
    // Chats and member lists show the new photo when they next load.
    void qc.invalidateQueries({ queryKey: keys.groups });
    void qc.invalidateQueries({ queryKey: ['members'] });
    toast.success(done);
  };
  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const uploaded = await api.files.upload(file, 'avatar');
      await apply(uploaded.id, 'Photo updated');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await apply(null, 'Photo removed');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Your profile"
        description="Your photo appears next to your name in chats, member lists and the directory."
      />
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card>
          <div className="flex flex-col items-center gap-3 px-5 py-6 text-center">
            <Avatar name={me.name} photo={me.photoUrl} size="2xl" />
            <span className="sr-only">
              {me.photoUrl ? 'You have a profile photo.' : 'No profile photo yet.'}
            </span>
            <div>
              <p className="text-[17px] font-bold">{me.name}</p>
              <p className="text-[13px] text-muted-foreground">{roleLabel(me)}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <label
                className={cn(
                  'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 text-[13.5px] font-semibold text-primary-foreground hover:bg-primary-hover',
                  busy && 'pointer-events-none opacity-60',
                )}
              >
                <Camera className="size-4" aria-hidden />
                {me.photoUrl ? 'Change photo' : 'Add a photo'}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label="Choose a profile photo"
                  onChange={pick}
                />
              </label>
              {me.photoUrl && (
                <Button variant="outline" loading={busy} onClick={remove}>
                  <Trash2 /> Remove
                </Button>
              )}
            </div>
            <p className="text-[12px] text-muted-foreground">
              A clear photo of your face helps teachers and classmates know you. JPG, PNG or WebP,
              up to 5 MB.
            </p>
          </div>
        </Card>
        <div className="space-y-5">
          <Card
            title="Your details"
            description="These come from the university's records. Ask IT Services if something is wrong."
          >
            <dl className="divide-y">
              {details(me).map(([label, value]) => (
                <div
                  key={label}
                  className="grid grid-cols-[160px_minmax(0,1fr)] gap-3 px-4 py-2.5 text-[13.5px]"
                >
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-semibold break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card title="Security">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13.5px]">
              <span className="text-muted-foreground">
                Changing your password signs you out everywhere else.
              </span>
              <Button variant="outline" onClick={() => setPassword(true)}>
                <KeyRound /> Change password
              </Button>
            </div>
          </Card>
        </div>
      </div>
      <ChangePasswordDialog open={password} onOpenChange={setPassword} />
    </>
  );
}
