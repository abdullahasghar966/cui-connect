/** The date sheet and seating plans (`/api/exams`). Writes are for the Examination Office. */
import { EXAM_KINDS, objectIdSchema, publishExamsSchema } from '@cui/shared';
import { type Request, Router } from 'express';
import { z } from 'zod';
import { currentUser } from '../../auth/middleware';
import { parse } from '../../lib/errors';
import {
  assignSeats,
  checkExam,
  deleteExam,
  examOptions,
  listExams,
  myExams,
  publishExams,
  saveExam,
  seatingChart,
} from '../../services/exams';

export const examsRouter = Router();

const id = (req: Request) => parse(objectIdSchema, req.params.examId);
const kindQuery = z.object({ kind: z.enum(EXAM_KINDS).optional() });

examsRouter.get('/', async (req, res) => {
  res.json(await listExams(currentUser(req), parse(kindQuery, req.query).kind));
});

examsRouter.get('/mine', async (req, res) => {
  res.json(await myExams(currentUser(req)));
});

examsRouter.get('/options', async (req, res) => {
  res.json(await examOptions(currentUser(req)));
});

examsRouter.post('/check', async (req, res) => {
  const { examId, ...input } = req.body ?? {};
  res.json(
    await checkExam(
      currentUser(req),
      input,
      examId === undefined ? undefined : parse(objectIdSchema, examId),
    ),
  );
});

examsRouter.post('/', async (req, res) => {
  res.status(201).json(await saveExam(currentUser(req), null, req.body));
});

examsRouter.post('/publish', async (req, res) => {
  res.json(await publishExams(currentUser(req), parse(publishExamsSchema, req.body).kind));
});

examsRouter.put('/:examId', async (req, res) => {
  res.json(await saveExam(currentUser(req), id(req), req.body));
});

examsRouter.delete('/:examId', async (req, res) => {
  await deleteExam(currentUser(req), id(req));
  res.json({ ok: true });
});

examsRouter.post('/:examId/seats', async (req, res) => {
  res.json(await assignSeats(currentUser(req), id(req)));
});

examsRouter.get('/:examId/seating', async (req, res) => {
  res.json(await seatingChart(currentUser(req), id(req)));
});
