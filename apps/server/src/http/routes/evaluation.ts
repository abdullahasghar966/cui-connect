/** Anonymous teacher evaluation (`/api/academics/evaluation`). */
import { objectIdSchema } from '@cui/shared';
import { type Request, Router } from 'express';
import { currentUser } from '../../auth/middleware';
import { parse } from '../../lib/errors';
import {
  evaluationHome,
  evaluationReport,
  setEvaluationWindow,
  submitEvaluation,
} from '../../services/evaluation';

export const evaluationRouter = Router();

const id = (req: Request) => parse(objectIdSchema, req.params.offeringId);

evaluationRouter.get('/', async (req, res) => {
  res.json(await evaluationHome(currentUser(req)));
});

evaluationRouter.put('/window', async (req, res) => {
  res.json(await setEvaluationWindow(currentUser(req), req.body));
});

evaluationRouter.post('/:offeringId', async (req, res) => {
  res.status(201).json(await submitEvaluation(currentUser(req), id(req), req.body));
});

evaluationRouter.get('/:offeringId/report', async (req, res) => {
  res.json(await evaluationReport(currentUser(req), id(req)));
});
