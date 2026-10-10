/** Terms (semesters). There is always exactly one current term. */
import {
  type CreateTermInput,
  campusClock,
  defaultTermDates,
  type TermDTO,
  termCodeFor,
  termIndex,
  termName,
} from '@cui/shared';
import { conflict, isDuplicateKeyError, notFound } from '../lib/errors';
import { Term, type TermDoc, type UserDoc } from '../models';
import { recordAudit } from './audit';

export function toTermDTO(term: TermDoc): TermDTO {
  return {
    id: String(term._id),
    code: term.code,
    name: term.name,
    startsOn: term.startsOn,
    endsOn: term.endsOn,
    current: term.current,
  };
}

let cached: Promise<TermDoc> | null = null;

/**
 * The current term, created on first use from today's campus date (so a fresh campus works
 * without any setup). Cached until terms change.
 */
export function currentTerm(): Promise<TermDoc> {
  if (!cached) {
    cached = (async () => {
      const current = await Term.findOne({ current: true }).lean<TermDoc>();
      if (current) return current;
      const code = termCodeFor(campusClock().date);
      try {
        const term = await Term.findOneAndUpdate(
          { code },
          {
            $set: { current: true },
            $setOnInsert: { code, name: termName(code), ...defaultTermDates(code) },
          },
          { upsert: true, returnDocument: 'after' },
        ).lean<TermDoc>();
        if (term) return term;
      } catch (err) {
        if (!isDuplicateKeyError(err)) throw err;
      }
      const raced = await Term.findOne({ current: true }).lean<TermDoc>();
      if (!raced) throw new Error('No current term');
      return raced;
    })();
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}

export function invalidateTermCache(): void {
  cached = null;
}

export async function listTerms(): Promise<TermDTO[]> {
  await currentTerm();
  const terms = await Term.find().lean<TermDoc[]>();
  return terms.sort((a, b) => termIndex(b.code) - termIndex(a.code)).map(toTermDTO);
}

export async function createTerm(actor: UserDoc, input: CreateTermInput): Promise<TermDTO> {
  try {
    const term = (
      await Term.create({ ...input, name: termName(input.code), current: false })
    ).toObject<TermDoc>();
    void recordAudit({
      action: 'term.created',
      actor,
      summary: `${actor.name} added the ${term.name} term`,
      targetType: 'term',
      targetId: term._id,
    });
    return toTermDTO(term);
  } catch (err) {
    if (isDuplicateKeyError(err)) throw conflict(`${input.code} already exists.`);
    throw err;
  }
}

/** Starts a new semester: timetables, attendance and marks now refer to this term. */
export async function setCurrentTerm(actor: UserDoc, termId: string): Promise<TermDTO> {
  const term = await Term.findById(termId).lean<TermDoc>();
  if (!term) throw notFound('Term not found.');
  await Term.updateMany({ current: true, _id: { $ne: term._id } }, { $set: { current: false } });
  await Term.updateOne({ _id: term._id }, { $set: { current: true } });
  invalidateTermCache();
  void recordAudit({
    action: 'term.current',
    actor,
    summary: `${actor.name} made ${term.name} the current term`,
    targetType: 'term',
    targetId: term._id,
  });
  return toTermDTO({ ...term, current: true });
}
