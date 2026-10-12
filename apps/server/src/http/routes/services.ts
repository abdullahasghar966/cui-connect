/** Campus services: requests and complaints, and fees (registration and evaluation follow). */
import { objectIdSchema, requestListSchema } from '@cui/shared';
import { type Request, Router } from 'express';
import { currentUser } from '../../auth/middleware';
import { parse } from '../../lib/errors';
import {
  cancelChallan,
  feeDesk,
  issueChallans,
  markPaid,
  markUnpaid,
  myFees,
} from '../../services/fees';
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

// ---- Fees ----

servicesRouter.get('/fees', async (req, res) => {
  res.json(await myFees(currentUser(req)));
});

servicesRouter.get('/fees/desk', async (req, res) => {
  res.json(await feeDesk(currentUser(req), req.query));
});

servicesRouter.post('/fees/challans', async (req, res) => {
  res.status(201).json(await issueChallans(currentUser(req), req.body));
});

servicesRouter.post('/fees/challans/:challanId/paid', async (req, res) => {
  res.json(await markPaid(currentUser(req), id(req, 'challanId'), req.body));
});

servicesRouter.post('/fees/challans/:challanId/unpaid', async (req, res) => {
  res.json(await markUnpaid(currentUser(req), id(req, 'challanId')));
});

servicesRouter.delete('/fees/challans/:challanId', async (req, res) => {
  res.json(await cancelChallan(currentUser(req), id(req, 'challanId')));
});
