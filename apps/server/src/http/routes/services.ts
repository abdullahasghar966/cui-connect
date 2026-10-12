/** Campus services: requests and complaints (fees, registration and evaluation follow). */
import { objectIdSchema, requestListSchema } from '@cui/shared';
import { type Request, Router } from 'express';
import { currentUser } from '../../auth/middleware';
import { parse } from '../../lib/errors';
import {
  changeRequestStatus,
  createRequest,
  listRequests,
  replyToRequest,
  requestDetail,
  withdrawRequest,
} from '../../services/requests';

export const servicesRouter = Router();

const id = (req: Request, name: string) => parse(objectIdSchema, req.params[name]);

servicesRouter.get('/requests', async (req, res) => {
  const { box } = parse(requestListSchema, req.query);
  res.json(await listRequests(currentUser(req), box));
});

servicesRouter.post('/requests', async (req, res) => {
  res.status(201).json(await createRequest(currentUser(req), req.body));
});

servicesRouter.get('/requests/:requestId', async (req, res) => {
  res.json(await requestDetail(currentUser(req), id(req, 'requestId')));
});

servicesRouter.post('/requests/:requestId/status', async (req, res) => {
  res.json(await changeRequestStatus(currentUser(req), id(req, 'requestId'), req.body));
});

servicesRouter.post('/requests/:requestId/replies', async (req, res) => {
  res.json(await replyToRequest(currentUser(req), id(req, 'requestId'), req.body));
});

servicesRouter.post('/requests/:requestId/withdraw', async (req, res) => {
  res.json(await withdrawRequest(currentUser(req), id(req, 'requestId')));
});
