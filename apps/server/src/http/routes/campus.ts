/** Campus life (`/api/campus`): events with RSVP (the map, jobs, lost & found and transport follow). */
import { objectIdSchema } from '@cui/shared';
import { type Request, Router } from 'express';
import { currentUser } from '../../auth/middleware';
import { parse } from '../../lib/errors';
import {
  cancelEvent,
  createEvent,
  decideEvent,
  eventDetail,
  eventsHome,
  rsvpEvent,
  updateEvent,
} from '../../services/events';

export const campusRouter = Router();

const id = (req: Request, name: string) => parse(objectIdSchema, req.params[name]);

campusRouter.get('/events', async (req, res) => {
  res.json(await eventsHome(currentUser(req)));
});

campusRouter.post('/events', async (req, res) => {
  res.status(201).json(await createEvent(currentUser(req), req.body));
});

campusRouter.get('/events/:eventId', async (req, res) => {
  res.json(await eventDetail(currentUser(req), id(req, 'eventId')));
});

campusRouter.put('/events/:eventId', async (req, res) => {
  res.json(await updateEvent(currentUser(req), id(req, 'eventId'), req.body));
});

campusRouter.post('/events/:eventId/decision', async (req, res) => {
  res.json(await decideEvent(currentUser(req), id(req, 'eventId'), req.body));
});

campusRouter.post('/events/:eventId/cancel', async (req, res) => {
  res.json(await cancelEvent(currentUser(req), id(req, 'eventId'), req.body));
});

campusRouter.put('/events/:eventId/rsvp', async (req, res) => {
  res.json(await rsvpEvent(currentUser(req), id(req, 'eventId'), req.body));
});
