/** University records everyone signed in can browse (terms, rooms, catalog, programmes). */
import {
  catalogCsvSchema,
  catalogQuerySchema,
  classChangeSchema,
  courseCodeSchema,
  dateSchema,
  objectIdSchema,
  programSchema,
  timetableQuerySchema,
} from '@cui/shared';
import { type Request, Router } from 'express';
import { currentUser } from '../../auth/middleware';
import { forbidden, parse } from '../../lib/errors';
import { CourseOffering, User, type UserDoc } from '../../models';
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
import { getOrgLookup, toPublicUserDTO } from '../../services/mappers';
import { listRooms } from '../../services/rooms';
import { listCourses } from '../../services/structure';
import { currentTerm, listTerms } from '../../services/terms';
import {
  changeClass,
  checkSlot,
  deleteSlot,
  listSectionSlots,
  restoreClass,
  saveSlot,
  timetableWeek,
  todayFor,
} from '../../services/timetable';

export const academicsRouter = Router();

const code = (req: Request) => parse(courseCodeSchema, req.params.code);
const id = (req: Request, name: string) => parse(objectIdSchema, req.params[name]);
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

/** Sections and teachers for pickers (timetables of any section or teacher are public). */
academicsRouter.get('/sections', async (_req, res) => {
  const org = await getOrgLookup();
  res.json(
    [...org.sections.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({
        id: String(s._id),
        name: s.name,
        program: s.program,
        intake: s.intake,
        departmentCode: org.departments.get(String(s.departmentId))?.code ?? null,
      })),
  );
});

academicsRouter.get('/teachers', async (_req, res) => {
  const [teachers, org] = await Promise.all([
    User.find({ role: 'faculty', active: true }).sort({ name: 1 }).lean<UserDoc[]>(),
    getOrgLookup(),
  ]);
  res.json(teachers.map((t) => toPublicUserDTO(t, org)));
});

/** This term's course offerings (optionally of one section): who teaches what to whom. */
academicsRouter.get('/offerings', async (req, res) => {
  const sectionId =
    typeof req.query.sectionId === 'string' ? parse(objectIdSchema, req.query.sectionId) : null;
  const courses = await listCourses();
  res.json(sectionId ? courses.filter((c) => c.sectionId === sectionId) : courses);
});

// ---- Timetable ----

academicsRouter.get('/timetable', async (req, res) => {
  res.json(await timetableWeek(currentUser(req), parse(timetableQuerySchema, req.query)));
});

academicsRouter.get('/timetable/today', async (req, res) => {
  res.json(await todayFor(currentUser(req)));
});

academicsRouter.get('/timetable/sections/:sectionId/slots', async (req, res) => {
  res.json(await listSectionSlots(currentUser(req), id(req, 'sectionId')));
});

academicsRouter.post('/timetable/check', async (req, res) => {
  const { slotId, ...input } = req.body ?? {};
  res.json(
    await checkSlot(
      currentUser(req),
      input,
      slotId === undefined ? undefined : parse(objectIdSchema, slotId),
    ),
  );
});

academicsRouter.post('/timetable/slots', async (req, res) => {
  res.status(201).json(await saveSlot(currentUser(req), null, req.body));
});

academicsRouter.put('/timetable/slots/:slotId', async (req, res) => {
  res.json(await saveSlot(currentUser(req), id(req, 'slotId'), req.body));
});

academicsRouter.delete('/timetable/slots/:slotId', async (req, res) => {
  await deleteSlot(currentUser(req), id(req, 'slotId'));
  res.json({ ok: true });
});

academicsRouter.post('/timetable/slots/:slotId/changes', async (req, res) => {
  await changeClass(currentUser(req), id(req, 'slotId'), parse(classChangeSchema, req.body));
  res.json({ ok: true });
});

academicsRouter.delete('/timetable/slots/:slotId/changes/:date', async (req, res) => {
  await restoreClass(currentUser(req), id(req, 'slotId'), parse(dateSchema, req.params.date));
  res.json({ ok: true });
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
