import {
  ATTENDANCE_LABELS,
  type AttendanceStatus,
  attendanceOutlook,
  formatClock,
  formatShortDate,
  type MyAttendanceCourseDTO,
  type TeachingCourseDTO,
} from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, QrCode, Sheet, TriangleAlert } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { EmptyState, Spinner } from '@/components/feedback';
import { PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/queries';
import { useAction } from '@/hooks/useSubmit';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';
import { cn } from '@/lib/utils';

export const STATUS_TONE: Record<AttendanceStatus, string> = {
  present: 'bg-primary',
  late: 'bg-warning',
  absent: 'bg-danger',
  leave: 'bg-border-strong',
};

const STATE_BADGE = {
  ok: { tone: 'success', label: 'On track' },
  warning: { tone: 'warning', label: 'Close to the minimum' },
  short: { tone: 'danger', label: 'Short' },
} as const;

function outlookText(course: MyAttendanceCourseDTO): string {
  const { summary, minimum } = course;
  if (!summary.held) return 'No classes recorded yet.';
  const { canMiss, mustAttend } = attendanceOutlook(summary, minimum);
  if (mustAttend) {
    return `Attend the next ${mustAttend} class${mustAttend === 1 ? '' : 'es'} in a row to reach ${minimum}%.`;
  }
  if (!canMiss) return `Missing one more class would take you below ${minimum}%.`;
  return `You can miss ${canMiss} more class${canMiss === 1 ? '' : 'es'} and stay at ${minimum}% or above.`;
}

function CourseAttendance({ course }: { course: MyAttendanceCourseDTO }) {
  const { summary, minimum } = course;
  const percent = summary.percent ?? 0;
  const badge = STATE_BADGE[summary.state];
  return (
    <section
      aria-label={`${course.course.code} ${course.course.title}`}
      className={cn(
        'rounded-lg border bg-surface p-4',
        summary.state === 'short' && 'border-danger/40',
        summary.state === 'warning' && 'border-warning/40',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link
            to={`/academics/courses/${course.course.code}`}
            className="font-mono text-[12.5px] font-semibold text-muted-foreground hover:underline"
          >
            {course.course.code}
          </Link>
          <h2 className="truncate text-[15px] font-bold">{course.course.title}</h2>
        </div>
        <p
          className={cn(
            'text-[26px] leading-none font-bold tabular-nums',
            summary.state === 'short' && 'text-danger',
            summary.state === 'warning' && 'text-warning',
          )}
        >
          {summary.percent === null ? '–' : `${summary.percent}%`}
        </p>
      </div>

      <div className="relative mt-3 h-2 rounded-full bg-muted" aria-hidden>
        <div
          className={cn(
            'h-full rounded-full',
            summary.state === 'short'
              ? 'bg-danger'
              : summary.state === 'warning'
                ? 'bg-warning'
                : 'bg-primary',
          )}
          style={{ width: `${percent}%` }}
        />
        <div
          className="absolute -top-1 h-4 w-0.5 rounded bg-foreground/60"
          style={{ left: `${minimum}%` }}
          title={`Minimum ${minimum}%`}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted-foreground">
        <Badge tone={badge.tone}>{badge.label}</Badge>
        <span>
          Attended {summary.attended} of {summary.held}
        </span>
        {summary.leave > 0 && <span>{summary.leave} on leave</span>}
      </div>
      <p className="mt-2 text-[13px]">{outlookText(course)}</p>

      {course.sessions.length > 0 && (
        <ol
          className="mt-3 flex flex-wrap gap-1"
          aria-label={`Class by class: ${course.sessions.filter((s) => s.status === 'absent').length} absences`}
        >
          {course.sessions.map((s, i) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: two classes can share a date
              key={`${s.date}-${i}`}
              title={`${formatShortDate(s.date)}: ${ATTENDANCE_LABELS[s.status]}`}
              className={cn('size-3 rounded-[3px]', STATUS_TONE[s.status])}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function MyAttendance() {
  const { data, isPending } = useQuery({
    queryKey: keys.myAttendance,
    queryFn: api.academics.myAttendance,
  });
  const minimum = data?.[0]?.minimum ?? 80;
  const short = (data ?? []).filter((c) => c.summary.state === 'short');
  return (
    <>
      <PageHeader
        title="My attendance"
        description={`You need at least ${minimum}% in each course to sit its terminal exam. Approved leave doesn't count against you.`}
      />
      {isPending ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !data?.length ? (
        <EmptyState icon={ClipboardCheck} title="No courses this term" />
      ) : (
        <>
          {short.length > 0 && (
            <p
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-[13.5px] text-danger"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              You are below {minimum}% in {short.map((c) => c.course.title).join(', ')}. Talk to
              your teacher and attend every remaining class.
            </p>
          )}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.map((course) => (
              <CourseAttendance key={course.course.offeringId} course={course} />
            ))}
          </div>
          <p className="mt-4 flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
            {(Object.keys(STATUS_TONE) as AttendanceStatus[]).map((status) => (
              <span key={status} className="inline-flex items-center gap-1.5">
                <span className={cn('size-2.5 rounded-[3px]', STATUS_TONE[status])} aria-hidden />
                {ATTENDANCE_LABELS[status]}
              </span>
            ))}
          </p>
        </>
      )}
    </>
  );
}

function TeachingRow({ course }: { course: TeachingCourseDTO }) {
  const navigate = useNavigate();
  const start = useAction(
    (slotId?: string) =>
      api.teaching.startAttendance({ offeringId: course.course.offeringId, slotId }),
    { invalidate: [keys.teachingCourses] },
  );
  const open = (slotId?: string) =>
    start.mutate(slotId, {
      onSuccess: (detail) => navigate(`/academics/attendance/session/${detail.session.id}`),
    });
  return (
    <li className="flex flex-col gap-3 px-4 py-3.5 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-bold">
          <span className="font-mono text-[12.5px] text-muted-foreground">
            {course.course.code}
          </span>{' '}
          {course.course.title} · {course.course.sectionName}
        </p>
        <p className="text-[12.5px] text-muted-foreground">
          {course.enrolled} students · {course.sessionsHeld} class
          {course.sessionsHeld === 1 ? '' : 'es'} recorded
          {course.averagePercent !== null && ` · average ${course.averagePercent}%`}
          {course.short > 0 && (
            <span className="font-semibold text-danger"> · {course.short} short</span>
          )}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {course.openSessionId ? (
          <Link
            to={`/academics/attendance/session/${course.openSessionId}`}
            className={buttonVariants()}
          >
            <QrCode /> Attendance is open
          </Link>
        ) : course.today.length ? (
          course.today.map((slot) => (
            <Button key={slot.slotId} loading={start.isPending} onClick={() => open(slot.slotId)}>
              <QrCode /> Take attendance · {formatClock(slot.start)}
            </Button>
          ))
        ) : (
          <Button variant="outline" loading={start.isPending} onClick={() => open()}>
            <QrCode /> Take attendance
          </Button>
        )}
        <Link
          to={`/academics/attendance/course/${course.course.offeringId}`}
          className={buttonVariants({ variant: 'outline' })}
        >
          <Sheet /> Sheet
        </Link>
      </div>
    </li>
  );
}

function TeachingAttendance() {
  const { data, isPending } = useQuery({
    queryKey: keys.teachingCourses,
    queryFn: api.teaching.courses,
  });
  return (
    <>
      <PageHeader
        title="Attendance"
        description="Show a QR code that students scan in class, or mark the roll by hand. Codes change every 10 seconds, so a photo sent to a friend stops working."
      />
      {isPending ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !data?.length ? (
        <EmptyState icon={ClipboardCheck} title="You don't teach a course this term" />
      ) : (
        <ul
          aria-label="Your courses"
          className="divide-y overflow-hidden rounded-lg border bg-surface"
        >
          {data.map((course) => (
            <TeachingRow key={course.course.offeringId} course={course} />
          ))}
        </ul>
      )}
    </>
  );
}

/** Students see their own attendance; teachers run attendance for their courses. */
export default function AttendancePage() {
  const me = useCurrentUser();
  if (me.role === 'student') return <MyAttendance />;
  if (me.role === 'faculty') return <TeachingAttendance />;
  return (
    <>
      <PageHeader title="Attendance" />
      <EmptyState icon={ClipboardCheck} title="Attendance is taken by each course's teacher">
        HODs, the Examination Office and IT can open any course's attendance sheet from its course
        page (Academics › Courses).
      </EmptyState>
    </>
  );
}
