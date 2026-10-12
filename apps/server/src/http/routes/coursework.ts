/**
 * Coursework for everyone in a course: reading assignments, materials and quizzes, and handing
 * in work. Teachers' changes are in teaching.ts.
 */
import { objectIdSchema } from '@cui/shared';
import { type Request, Router } from 'express';
import { currentUser } from '../../auth/middleware';
import { parse } from '../../lib/errors';
import {
  assignmentDetail,
  courseCoursework,
  courseworkOverview,
  submitAssignment,
  withdrawSubmission,
} from '../../services/coursework';
import { quizView } from '../../services/quizzes';

export const courseworkRouter = Router();

const id = (req: Request, name: string) => parse(objectIdSchema, req.params[name]);

courseworkRouter.get('/', async (req, res) => {
  res.json(await courseworkOverview(currentUser(req)));
});

courseworkRouter.get('/courses/:offeringId', async (req, res) => {
  res.json(await courseCoursework(currentUser(req), id(req, 'offeringId')));
});

courseworkRouter.get('/assignments/:assignmentId', async (req, res) => {
  res.json(await assignmentDetail(currentUser(req), id(req, 'assignmentId')));
});

courseworkRouter.put('/assignments/:assignmentId/submission', async (req, res) => {
  res.json(await submitAssignment(currentUser(req), id(req, 'assignmentId'), req.body));
});

courseworkRouter.delete('/assignments/:assignmentId/submission', async (req, res) => {
  await withdrawSubmission(currentUser(req), id(req, 'assignmentId'));
  res.json({ ok: true });
});

courseworkRouter.get('/quizzes/:quizId', async (req, res) => {
  res.set('cache-control', 'no-store');
  res.json(await quizView(currentUser(req), id(req, 'quizId')));
});
