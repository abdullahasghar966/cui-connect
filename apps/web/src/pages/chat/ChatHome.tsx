import type { Role } from '@cui/shared';
import { Check, MessagesSquare, X } from 'lucide-react';
import { useCurrentUser } from '@/hooks/queries';
import { describeUser } from './Sidebar';

const CAN: Record<Role, { yes: string[]; no: string[] }> = {
  student: {
    yes: [
      'Read campus and department announcements',
      'Chat in your class section, courses and societies',
      'Message your instructors, batch advisor, HOD, classmates and offices',
    ],
    no: [
      'Post in announcement channels',
      'See faculty lounges or other sections’ groups',
      'Message faculty who don’t teach you, or IT admins directly',
    ],
  },
  faculty: {
    yes: [
      'Moderate the courses you teach and sections you advise (lock, mute, delete)',
      'Discuss with colleagues in your faculty lounge',
      'Message colleagues, offices, your department’s students and students you teach',
    ],
    no: ['Post campus-wide announcements', 'Read students’ private conversations'],
  },
  staff: {
    yes: ['Reach anyone on campus by direct message', 'Post in the channels your office moderates'],
    no: ['Join faculty lounges', 'Read private conversations'],
  },
  admin: {
    yes: [
      'Post official campus announcements',
      'Manage users, sections, courses and groups from the Admin console',
      'Watch the live audit feed of blocked attempts',
    ],
    no: ['Read anyone’s direct messages'],
  },
};

export function ChatHome() {
  const me = useCurrentUser();
  const rules = CAN[me.role];
  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto p-8">
      <div className="w-full max-w-lg text-center">
        <span className="mx-auto inline-flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <MessagesSquare className="size-7" aria-hidden />
        </span>
        <h1 className="mt-4 text-xl font-semibold">Welcome, {me.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{describeUser(me)}</p>
        <div className="mt-8 grid gap-4 text-left sm:grid-cols-2">
          <div className="rounded-2xl border bg-surface p-4">
            <p className="text-xs font-semibold tracking-wide text-success uppercase">You can</p>
            <ul className="mt-2 space-y-2 text-sm">
              {rules.yes.map((item) => (
                <li key={item} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border bg-surface p-4">
            <p className="text-xs font-semibold tracking-wide text-danger uppercase">You can't</p>
            <ul className="mt-2 space-y-2 text-sm">
              {rules.no.map((item) => (
                <li key={item} className="flex gap-2">
                  <X className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          Pick a conversation on the left to get started.
        </p>
      </div>
    </div>
  );
}
