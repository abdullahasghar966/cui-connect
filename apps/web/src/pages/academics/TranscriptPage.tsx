import { useQuery } from '@tanstack/react-query';
import { FileText, Printer } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { EmptyState, Spinner } from '@/components/feedback';
import { PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/queries';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { fixed, gradeTone, looksUpStudents, RecordTabs, StudentPicker } from './records-ui';

const issued = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Karachi',
});

/** The official grades, term by term, ready to print. */
export default function TranscriptPage() {
  const me = useCurrentUser();
  const [params] = useSearchParams();
  const studentId = params.get('student') ?? undefined;
  const staff = looksUpStudents(me);
  const query = useQuery({
    queryKey: ['academics', 'transcript', studentId ?? 'me'],
    queryFn: () => api.academics.transcript(studentId),
    enabled: !staff || !!studentId,
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
  });
  const data = query.data;

  return (
    <>
      <div data-print-hide>
        <PageHeader
          title="Transcript"
          description="Final grades only (projected grades of the current term are on Results). A retaken course counts once in the CGPA: its latest attempt."
          actions={
            data && (
              <Button variant="outline" onClick={() => window.print()}>
                <Printer /> Print
              </Button>
            )
          }
        />
        <RecordTabs me={me} />
        {staff && <StudentPicker current={data?.student ?? null} />}
      </div>

      {staff && !studentId ? (
        <EmptyState
          icon={FileText}
          title="Choose a student"
          className="rounded-lg border bg-surface"
        >
          You can open the records of students you teach or advise, your department's students if
          you're its HOD, and anyone's if you're in the Examination Office or IT.
        </EmptyState>
      ) : query.isPending ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !data ? (
        <EmptyState icon={FileText} title="Can't open this transcript">
          {query.error instanceof ApiError ? query.error.message : 'Try again in a moment.'}
        </EmptyState>
      ) : (
        <article data-print className="rounded-lg border bg-surface p-6 print:border-0 print:p-0">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
            <div>
              <p className="text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
                COMSATS University Islamabad · Unofficial transcript
              </p>
              <h2 className="mt-1 text-[20px] font-bold">{data.student.name}</h2>
              <p className="text-[13.5px] text-muted-foreground">
                {[
                  data.student.regNo,
                  data.student.programName,
                  data.student.sectionName,
                  data.student.intake ? `intake ${data.student.intake}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
              <dt className="text-muted-foreground">CGPA</dt>
              <dd className="text-right text-[18px] font-bold tabular-nums">{fixed(data.cgpa)}</dd>
              <dt className="text-muted-foreground">Credits earned</dt>
              <dd className="text-right font-semibold tabular-nums">
                {data.creditsEarned}
                {data.creditsRequired ? ` / ${data.creditsRequired}` : ''}
              </dd>
            </dl>
          </header>

          {!data.terms.length ? (
            <p className="py-8 text-center text-[13.5px] text-muted-foreground">
              No final grades yet.
            </p>
          ) : (
            <div className="mt-4 grid gap-5 lg:grid-cols-2 print:grid-cols-2">
              {data.terms.map((t) => (
                <section key={t.term.code} aria-label={t.term.name} className="break-inside-avoid">
                  <h3 className="mb-1 flex items-baseline justify-between text-[14px] font-bold">
                    {t.term.name}
                    <span className="text-[12.5px] font-normal text-muted-foreground tabular-nums">
                      {t.credits} cr · GPA{' '}
                      <span className="font-bold text-foreground">{fixed(t.gpa)}</span>
                    </span>
                  </h3>
                  <table className="w-full text-[13px]">
                    <caption className="sr-only">{t.term.name} grades</caption>
                    <thead className="text-[11.5px] text-muted-foreground">
                      <tr className="border-b">
                        <th scope="col" className="py-1 text-left font-semibold">
                          Course
                        </th>
                        <th scope="col" className="py-1 text-right font-semibold">
                          Cr
                        </th>
                        <th scope="col" className="py-1 text-right font-semibold">
                          Grade
                        </th>
                        <th scope="col" className="py-1 text-right font-semibold">
                          Points
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.courses.map((c) => (
                        <tr key={c.code} className="border-b last:border-b-0">
                          <td className="py-1">
                            <span className="font-mono text-[12px] text-muted-foreground">
                              {c.code}
                            </span>{' '}
                            {c.title}
                          </td>
                          <td className="py-1 text-right tabular-nums">{c.credits}</td>
                          <td className={cn('py-1 text-right font-bold', gradeTone(c.points))}>
                            {c.grade}
                          </td>
                          <td className="py-1 text-right tabular-nums">{c.points.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ))}
            </div>
          )}
          <footer className="mt-6 border-t pt-3 text-[11.5px] text-muted-foreground">
            Generated by CUI Connect on {issued.format(new Date(data.generatedAt))}. Grades A ≥ 85,
            A− ≥ 80, B+ ≥ 75, B ≥ 71, B− ≥ 68, C+ ≥ 64, C ≥ 61, C− ≥ 58, D+ ≥ 54, D ≥ 50, F below
            50. For an official copy, apply to the Examination Office.
          </footer>
        </article>
      )}
    </>
  );
}
