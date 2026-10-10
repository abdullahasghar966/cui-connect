/**
 * Upgrades a campus created before the university features existed, on every start (each step
 * is idempotent): there is a current term, every course offering belongs to a term, and every
 * offered course code is in the catalog.
 */
import { logger } from '../lib/logger';
import { CourseOffering } from '../models';
import { ensureCatalogForOfferings } from './catalog';
import { currentTerm } from './terms';

export async function ensureAcademicDefaults(): Promise<void> {
  const term = await currentTerm();
  const { modifiedCount } = await CourseOffering.updateMany(
    { termId: null },
    { $set: { termId: term._id } },
  );
  const added = await ensureCatalogForOfferings();
  if (modifiedCount || added) {
    logger.info(
      { term: term.code, offerings: modifiedCount, catalogEntries: added },
      'Upgraded existing courses for the university features',
    );
  }
}
