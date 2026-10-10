/** University records everyone signed in can browse (terms, rooms, catalog, programmes). */
import { catalogCsvSchema, catalogQuerySchema, courseCodeSchema, programSchema } from '@cui/shared';
import { type Request, Router } from 'express';
import { currentUser } from '../../auth/middleware';
import { forbidden, parse } from '../../lib/errors';
import { CourseOffering } from '../../models';
import {
  deleteCatalogCourse,
  deleteProgram,
  getCatalogCourse,
  importCatalogCsv,
  listCatalog,
  listPrograms,
  saveCatalogCourse,
  saveProgram,
  toCatalogDTO,
} from '../../services/catalog';
import { getOrgLookup } from '../../services/mappers';
import { listRooms } from '../../services/rooms';
import { currentTerm, listTerms } from '../../services/terms';

export const academicsRouter = Router();

const code = (req: Request) => parse(courseCodeSchema, req.params.code);
const programCode = (req: Request) => parse(programSchema.shape.code, req.params.code);

academicsRouter.get('/terms', async (_req, res) => {
  res.json(await listTerms());
});

academicsRouter.get('/rooms', async (_req, res) => {
  res.json(await listRooms());
});

academicsRouter.get('/catalog', async (req, res) => {
  res.json(await listCatalog(parse(catalogQuerySchema, req.query)));
});

academicsRouter.get('/catalog/:code', async (req, res) => {
  const course = await getCatalogCourse(code(req));
  const term = await currentTerm();
  const offered = await CourseOffering.countDocuments({ code: course.code, termId: term._id });
  res.json(toCatalogDTO(course, await getOrgLookup(), offered));
});

academicsRouter.put('/catalog/:code', async (req, res) => {
  res.json(await saveCatalogCourse(currentUser(req), code(req), req.body));
});

academicsRouter.delete('/catalog/:code', async (req, res) => {
  await deleteCatalogCourse(currentUser(req), code(req));
  res.json({ ok: true });
});

academicsRouter.post('/catalog/import', async (req, res) => {
  const me = currentUser(req);
  const manager =
    me.role === 'admin' ||
    (me.role === 'faculty' && me.isHOD) ||
    (me.role === 'staff' && me.office === 'DEPARTMENT');
  if (!manager)
    throw forbidden('Only IT Services, HODs and department offices can import courses.');
  const { csv } = parse(catalogCsvSchema, req.body);
  res.json(await importCatalogCsv(me, csv));
});

academicsRouter.get('/programs', async (_req, res) => {
  res.json(await listPrograms());
});

academicsRouter.put('/programs/:code', async (req, res) => {
  res.json(await saveProgram(currentUser(req), programCode(req), req.body));
});

academicsRouter.delete('/programs/:code', async (req, res) => {
  await deleteProgram(currentUser(req), programCode(req));
  res.json({ ok: true });
});
