import { formatCardDate, type IdCardDTO, type IdCardStatus } from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, ExternalLink, IdCard, ShieldCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, Spinner } from '@/components/feedback';
import { Card, PageHeader } from '@/components/page';
import { Avatar } from '@/components/people';
import { Button, buttonVariants } from '@/components/ui/button';
import { errorMessage } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { cn } from '@/lib/utils';

/** The band across the card; the card itself stays white in both themes, like a printed one. */
const BAND: Record<IdCardDTO['role'], string> = {
  student: 'bg-[#0E7B58]',
  faculty: 'bg-[#1D4ED8]',
  staff: 'bg-[#9A3412]',
  admin: 'bg-[#334155]',
};

const NOT_VALID: Record<Exclude<IdCardStatus, 'valid'>, string> = {
  expired: 'Expired',
  invalid: 'Not valid',
};

function rows(card: IdCardDTO): [string, string][] {
  const all: [string, string | null][] = [
    ['Registration no.', card.regNo],
    ['Designation', card.designation],
    ['Programme', card.programme],
    ['Section', card.sectionName],
    ['Department', card.programme ? null : card.department],
    ['Valid until', card.validUntil ? formatCardDate(card.validUntil) : null],
  ];
  return all.filter((r): r is [string, string] => !!r[1]);
}

/** The card as it would be printed (portrait, so it fits a phone held up at the gate). */
export function IdCardFace({ card, verifyUrl }: { card: IdCardDTO; verifyUrl: string }) {
  return (
    <figure
      aria-label={`ID card of ${card.name}`}
      className="relative mx-auto w-full max-w-[340px] overflow-hidden rounded-2xl bg-white text-[#0f172a] shadow-lg ring-1 ring-black/10"
    >
      <div className="flex items-center gap-2.5 bg-[#0E7B58] px-4 py-3 text-white">
        <svg viewBox="0 0 64 64" className="size-8 shrink-0" aria-hidden>
          <rect width="64" height="64" rx="14" fill="#fff" />
          <path
            d="M43 22.4A14.5 14.5 0 1 0 43 41.6"
            fill="none"
            stroke="#0E7B58"
            strokeWidth="7"
            strokeLinecap="round"
          />
          <circle cx="45" cy="32" r="4.2" fill="#0E7B58" />
        </svg>
        <div className="min-w-0 leading-tight">
          <p className="text-[13.5px] font-bold">COMSATS University Islamabad</p>
          <p className="text-[11.5px] opacity-90">Islamabad Campus</p>
        </div>
      </div>
      <div className="flex flex-col items-center px-5 pt-5 pb-4 text-center">
        <Avatar name={card.name} photo={card.photoUrl} size="2xl" />
        <p className="mt-3 text-[19px] leading-tight font-bold">{card.name}</p>
        <p
          className={cn(
            'mt-2 rounded-full px-3 py-0.5 text-[11.5px] font-bold tracking-[0.08em] text-white uppercase',
            BAND[card.role],
          )}
        >
          {card.kind}
        </p>
        <dl className="mt-4 w-full space-y-1.5 text-left text-[13px]">
          {rows(card).map(([label, value]) => (
            <div key={label} className="grid grid-cols-[118px_minmax(0,1fr)] gap-2">
              <dt className="text-[#64748b]">{label}</dt>
              <dd className="font-semibold break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="flex items-center gap-3 border-t border-dashed border-[#cbd5e1] px-5 py-4">
        <div className="size-[104px] shrink-0 rounded-lg bg-white p-1.5 ring-1 ring-[#e2e8f0]">
          <QRCodeSVG
            value={verifyUrl}
            level="M"
            marginSize={0}
            className="size-full"
            title="Scan to check this card"
          />
        </div>
        <p className="text-left text-[11.5px] leading-snug text-[#475569]">
          Scan to check this card is genuine.
          <br />
          Card {card.issue} · issued {formatCardDate(card.issuedOn)}
        </p>
      </div>
      {card.status !== 'valid' && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/55">
          <span className="-rotate-12 rounded-lg border-4 border-[#dc2626] px-4 py-1 text-[26px] font-black tracking-wider text-[#dc2626] uppercase">
            {NOT_VALID[card.status]}
          </span>
        </div>
      )}
    </figure>
  );
}

/** Your digital ID card, and what anyone who scans it sees. */
export default function IdCardPage() {
  const card = useQuery({ queryKey: keys.idCard, queryFn: api.idCard });

  if (card.isPending) {
    return (
      <div className="p-6">
        <Spinner />
      </div>
    );
  }
  if (!card.data) {
    return <EmptyState icon={IdCard} title="Your card could not be loaded" />;
  }
  const c = card.data;
  const verifyPath = `/verify/${c.code}`;
  const verifyUrl = `${window.location.origin}${verifyPath}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(verifyUrl);
      toast.success('Link copied');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title="ID card"
        description="Show it at the gate, the library or an exam hall. Anyone can scan the QR code to check that it is genuine."
      />
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div data-testid="id-card" data-verify-path={verifyPath}>
          <IdCardFace card={c} verifyUrl={verifyUrl} />
        </div>
        <div className="space-y-5">
          <Card title="When someone scans it">
            <div className="space-y-3 px-4 py-3 text-[13.5px]">
              <p className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                <span>
                  They see whether the card is valid, with only what is printed on it: your name,{' '}
                  {c.regNo ? 'registration number' : 'designation'}, department and photo. Never
                  your email, marks, fees or anything else.
                </span>
              </p>
              <p className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                <span>
                  The code in the QR is random. When a card is replaced it gets a new code, so a
                  lost card stops working straight away.
                </span>
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <a
                  href={verifyPath}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({ variant: 'outline' })}
                >
                  <ExternalLink /> See what they see
                </a>
                <Button variant="outline" onClick={copy}>
                  <Copy /> Copy link
                </Button>
              </div>
            </div>
          </Card>
          <Card title="Lost or damaged?">
            <div className="px-4 py-3 text-[13.5px]">
              {c.role === 'student' ? (
                <p>
                  Ask Student Affairs for a new card from{' '}
                  <Link to="/services/requests" className="font-semibold text-primary underline">
                    Requests
                  </Link>
                  . When it is ready, this page shows the new card and the old one stops verifying.
                </p>
              ) : (
                <p>
                  Ask IT Services for a new card. When they issue it, this page shows the new card
                  and the old one stops verifying.
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
