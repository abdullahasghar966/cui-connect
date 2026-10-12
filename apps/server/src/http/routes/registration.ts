/** Course registration for the coming term (`/api/academics/registration`). */
import { objectIdSchema } from '@cui/shared';
import { type Request, Router } from 'express';
import { currentUser } from '../../auth/middleware';
import { parse } from '../../lib/errors';
import {
  approvePlan,
  deleteOffer,
  offerStudents,
  planOffers,
  registrationApprovals,
  registrationDetail,
  registrationHome,
  returnPlan,
  saveOffer,
  savePlan,
  setRegistrationWindow,
  submitPlan,
  withdrawPlan,
} from '../../services/registration';

export const registrationRouter = Router();

const id = (req: Request, name: string) => parse(objectIdSchema, req.params[name]);

registrationRouter.get('/', async (req, res) => {
  res.json(await registrationHome(currentUser(req)));
});

// Students
registrationRouter.put('/plan', async (req, res) => {
  res.json(await savePlan(currentUser(req), req.body));
});

registrationRouter.post('/plan/submit', async (req, res) => {
  res.json(await submitPlan(currentUser(req)));
});

registrationRouter.post('/plan/withdraw', async (req, res) => {
  res.json(await withdrawPlan(currentUser(req)));
});

// The window (Director's Office, IT)
registrationRouter.put('/window', async (req, res) => {
  res.json(await setRegistrationWindow(currentUser(req), req.body));
});

// Offers (department office, IT)
registrationRouter.post('/offers', async (req, res) => {
  res.status(201).json(await saveOffer(currentUser(req), req.body));
});

registrationRouter.post('/offers/plan', async (req, res) => {
  res.json(await planOffers(currentUser(req), req.body));
});

registrationRouter.put('/offers/:offerId', async (req, res) => {
  res.json(await saveOffer(currentUser(req), req.body, id(req, 'offerId')));
});

registrationRouter.delete('/offers/:offerId', async (req, res) => {
  res.json(await deleteOffer(currentUser(req), id(req, 'offerId')));
});

registrationRouter.get('/offers/:offerId/students', async (req, res) => {
  res.json(await offerStudents(currentUser(req), id(req, 'offerId')));
});

// Advisors
registrationRouter.get('/approvals', async (req, res) => {
  res.json(await registrationApprovals(currentUser(req)));
});

registrationRouter.get('/:registrationId', async (req, res) => {
  res.json(await registrationDetail(currentUser(req), id(req, 'registrationId')));
});

registrationRouter.post('/:registrationId/approve', async (req, res) => {
  res.json(await approvePlan(currentUser(req), id(req, 'registrationId'), req.body));
});

registrationRouter.post('/:registrationId/return', async (req, res) => {
  res.json(await returnPlan(currentUser(req), id(req, 'registrationId'), req.body));
});
