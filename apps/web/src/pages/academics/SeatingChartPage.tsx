import { EXAM_KIND_LABELS, formatShortDate, formatTimeRange } from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { Armchair, ArrowLeft, Printer } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { EmptyState, Spinner } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { ApiError, api } from '@/lib/api';
import { courseHues } from '@/lib/utils';

/** 1, 2, … n. */
const numbers = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

/** A printable seating plan: one grid per room, front row at the top. */
export default function SeatingChartPage() {
  const { examId = '' } = useParams();
  const chart = useQuery({
    queryKey: ['exams', 'seating', examId],
    queryFn: () => api.exams.seating(examId),
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
  });
  const back = (
    <Link
      to="/academics/exams"
      data-print-hide
      className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden /> Exams
    </Link>
  );
  if (chart.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (!chart.data) {
    return (
      <>
        {back}
        <EmptyState icon={Armchair} title="Can't open this seating chart">
          {chart.error instanceof ApiError ? chart.error.message : 'Try again in a moment.'}
        </EmptyState>
      </>
    );
  }
  const { exam, rooms, unseated } = chart.data;
  const hueFor = courseHues(exam.sections.map((s) => s.sectionName ?? ''));

  return (
    <div data-print>
      {back}
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12.5px] font-semibold text-muted-foreground uppercase">
            Seating plan · {EXAM_KIND_LABELS[exam.kind]}
          </p>
          <h1 className="text-[22px] leading-tight font-bold tracking-tight">
            {exam.code} {exam.title}
          </h1>
          <p className="mt-1 text-[14px] text-muted-foreground">
            {formatShortDate(exam.date)}, {formatTimeRange(exam.start, exam.end)} ·{' '}
            {exam.sections.map((s) => s.sectionName).join(', ')} · {exam.seated} of {exam.students}{' '}
            seated
          </p>
        </div>
        <Button variant="outline" onClick={() => window.print()} data-print-hide>
          <Printer /> Print
        </Button>
      </header>

      {unseated > 0 && (
        <p className="mb-4 rounded-md border border-warning/25 bg-warning-soft px-3 py-2 text-[13px] text-warning">
          {unseated} student{unseated === 1 ? ' has' : 's have'} no seat yet. Add a room and assign
          seats again.
        </p>
      )}
      {!exam.seated ? (
        <EmptyState
          icon={Armchair}
          title="Seats haven't been assigned yet"
          className="rounded-lg border bg-surface"
        />
      ) : (
        <div className="space-y-6">
          {rooms.map(({ room, rows, cols, seats }) => {
            const at = new Map(seats.map((s) => [`${s.row}:${s.seat}`, s.student]));
            return (
              <section key={room.id} aria-label={room.name} className="break-inside-avoid">
                <h2 className="mb-2 text-[15px] font-bold">
                  {room.name}{' '}
                  <span className="font-normal text-muted-foreground">
                    · {room.block} · {seats.length} students
                  </span>
                </h2>
                <p className="mb-1 text-center text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Front (invigilator)
                </p>
                <div
                  className="grid gap-1"
                  style={{ gridTemplateColumns: `28px repeat(${cols}, minmax(0, 1fr))` }}
                >
                  {numbers(rows).map((row) => (
                    <div key={`row-${row}`} className="contents">
                      <span className="flex items-center justify-center text-[11px] font-semibold text-muted-foreground">
                        R{row}
                      </span>
                      {numbers(cols).map((seat) => {
                        const student = at.get(`${row}:${seat}`);
                        return student ? (
                          <div
                            key={`${row}:${seat}`}
                            className="min-w-0 rounded border border-l-4 bg-surface px-1.5 py-1 text-[11px] leading-tight"
                            style={{
                              borderLeftColor: `hsl(${hueFor(student.sectionName ?? '')} 55% 42%)`,
                            }}
                            title={`Row ${row}, seat ${seat}: ${student.name}`}
                          >
                            <p className="truncate font-bold tabular-nums">
                              {student.regNo ?? '—'}
                            </p>
                            <p className="truncate text-muted-foreground">{student.name}</p>
                          </div>
                        ) : (
                          <div
                            key={`${row}:${seat}`}
                            aria-hidden
                            className="rounded border border-dashed bg-surface-2/60"
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
          <p className="flex flex-wrap gap-3 text-[12px] text-muted-foreground">
            {exam.sections.map((s) => (
              <span key={s.offeringId} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="size-2.5 rounded-sm"
                  style={{ background: `hsl(${hueFor(s.sectionName ?? '')} 55% 42%)` }}
                />
                {s.sectionName}
              </span>
            ))}
          </p>
        </div>
      )}
    </div>
  );
}
