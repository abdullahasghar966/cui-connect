import { formatCardDate, type IdCardCheckDTO } from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, CircleX } from 'lucide-react';
import { useParams } from 'react-router';
import { Spinner } from '@/components/feedback';
import { Logo } from '@/components/Logo';
import { Avatar } from '@/components/people';
import { errorMessage } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const checkedFormat = new Intl.DateTimeFormat('en-GB', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const RESULT = {
  valid: {
    icon: CircleCheck,
    title: 'Valid card',
    text: 'This is a genuine COMSATS University Islamabad ID card. Check that the photo matches the person showing it.',
    tone: 'border-success/30 bg-primary-soft text-success',
  },
  expired: {
    icon: CircleAlert,
    title: 'This card has expired',
    text: 'It was issued by the university but is past its end date. The holder should ask for a new card.',
    tone: 'border-warning/30 bg-warning-soft text-warning',
  },
  invalid: {
    icon: CircleX,
    title: 'Not a valid card',
    text: 'This card is not recognised: it may have been replaced, reported lost, or belong to someone who has left the university. Do not accept it.',
    tone: 'border-danger/30 bg-danger-soft text-danger',
  },
} as const;

function Holder({ code, holder }: { code: string; holder: NonNullable<IdCardCheckDTO['holder']> }) {
  const details: [string, string][] = [
    [holder.kind === 'Student' ? 'Registration no.' : 'Designation', holder.number ?? '—'],
    ['Department', holder.department ?? '—'],
    ['Valid until', holder.validUntil ? formatCardDate(holder.validUntil) : 'While employed'],
  ];
  return (
    <div className="flex flex-col items-center px-5 py-6 text-center">
      <Avatar
        name={holder.name}
        photo={holder.hasPhoto ? `/api/verify/${encodeURIComponent(code)}/photo` : null}
        size="2xl"
      />
      <p className="mt-3 text-[20px] leading-tight font-bold">{holder.name}</p>
      <p className="mt-1 text-[13.5px] font-semibold text-muted-foreground">{holder.kind}</p>
      <dl className="mt-4 w-full divide-y rounded-lg border text-left text-[13.5px]">
        {details.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[130px_minmax(0,1fr)] gap-2 px-3 py-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-semibold break-words">{value}</dd>
          </div>
        ))}
      </dl>
      {holder.issue > 1 && (
        <p className="mt-3 text-[12.5px] text-muted-foreground">
          Card {holder.issue}: earlier cards of this person no longer verify.
        </p>
      )}
    </div>
  );
}

/** Public: what a guard, librarian or employer sees after scanning an ID card's QR. */
export default function VerifyPage() {
  const { code = '' } = useParams();
  const check = useQuery({
    queryKey: ['verify', code],
    queryFn: () => api.checkIdCard(code),
    retry: false,
    staleTime: 0,
  });
  const result = check.data ? RESULT[check.data.status] : null;

  return (
    <div className="min-h-full bg-surface-2">
      <main className="mx-auto flex max-w-[440px] flex-col px-4 pt-10 pb-10 sm:px-6">
        <div className="flex items-center justify-center gap-2.5">
          <Logo size={30} />
          <span className="text-[18px] font-bold tracking-tight">CUI Connect</span>
        </div>
        <h1 className="mt-8 text-center text-[24px] leading-tight font-bold tracking-tight">
          ID card check
        </h1>
        <p className="mt-1.5 text-center text-[14px] text-muted-foreground">
          COMSATS University Islamabad, Islamabad Campus
        </p>

        <section className="mt-6 overflow-hidden rounded-xl border bg-surface shadow-sm">
          {check.isPending ? (
            <div className="flex justify-center p-10">
              <Spinner label="Checking the card" />
            </div>
          ) : check.isError || !check.data || !result ? (
            <p role="alert" className="p-6 text-center text-[14px] text-danger">
              {errorMessage(check.error)}
            </p>
          ) : (
            <>
              <div
                role="status"
                className={cn('flex items-start gap-3 border-b px-5 py-4', result.tone)}
              >
                <result.icon className="mt-0.5 size-7 shrink-0" aria-hidden />
                <div>
                  <p className="text-[18px] leading-tight font-bold">{result.title}</p>
                  <p className="mt-1 text-[13.5px] text-foreground">{result.text}</p>
                </div>
              </div>
              {check.data.holder && <Holder code={code} holder={check.data.holder} />}
              <p className="border-t px-5 py-3 text-center text-[12.5px] text-muted-foreground">
                Checked {checkedFormat.format(new Date(check.data.checkedAt))}
              </p>
            </>
          )}
        </section>
        <p className="mt-5 text-center text-[12.5px] text-muted-foreground">
          Only the details printed on the card are shown here. Questions? Ask Student Affairs or IT
          Services.
        </p>
      </main>
    </div>
  );
}
