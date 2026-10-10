import type { UserDTO } from '@cui/shared';
import { semesterNumber } from '@cui/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { keys } from '@/lib/cache';

const LONG = 5 * 60_000;

export function useTerms() {
  return useQuery({ queryKey: keys.terms, queryFn: api.academics.terms, staleTime: LONG });
}

export function useCurrentTerm() {
  const { data } = useTerms();
  return data?.find((t) => t.current) ?? null;
}

export function useRooms() {
  return useQuery({ queryKey: keys.rooms, queryFn: api.academics.rooms, staleTime: LONG });
}

export function usePrograms() {
  return useQuery({ queryKey: keys.programs, queryFn: api.academics.programs, staleTime: LONG });
}

/** A student's semester, from the intake in their registration number (FA23-BCS-001 → FA23). */
export function useStudentSemester(me: UserDTO): number | null {
  const term = useCurrentTerm();
  if (me.role !== 'student' || !me.regNo || !term) return null;
  return semesterNumber(me.regNo.slice(0, 4), term.code);
}
