/** Campus life (`/api/campus`): events, jobs, lost & found, the map and transport. */
import { objectIdSchema } from '@cui/shared';
import { type Request, Router } from 'express';
import { z } from 'zod';
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
import { closeJob, jobsHome, saveJob, toggleSavedJob } from '../../services/jobs';
import {
  claimItem,
  deleteItem,
  lostFoundHome,
  lostItemDetail,
  reportItem,
  resolveItem,
} from '../../services/lostfound';
import { deletePlace, listPlaces, savePlace } from '../../services/places';
import {
  deleteRoute,
  saveRoute,
  setRouteNotice,
  setSavedRoute,
  transportHome,
} from '../../services/transport';

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

// ---- Jobs and internships ----

campusRouter.get('/jobs', async (req, res) => {
  res.json(await jobsHome(currentUser(req)));
});

campusRouter.post('/jobs', async (req, res) => {
  res.status(201).json(await saveJob(currentUser(req), req.body));
});

campusRouter.put('/jobs/:jobId', async (req, res) => {
  res.json(await saveJob(currentUser(req), req.body, id(req, 'jobId')));
});

campusRouter.post('/jobs/:jobId/close', async (req, res) => {
  res.json(await closeJob(currentUser(req), id(req, 'jobId')));
});

campusRouter.put('/jobs/:jobId/saved', async (req, res) => {
  const { saved } = parse(z.object({ saved: z.boolean() }), req.body);
  res.json(await toggleSavedJob(currentUser(req), id(req, 'jobId'), saved));
});

// ---- Lost & found ----

campusRouter.get('/lost-found', async (req, res) => {
  res.json(await lostFoundHome(currentUser(req)));
});

campusRouter.post('/lost-found', async (req, res) => {
  res.status(201).json(await reportItem(currentUser(req), req.body));
});

campusRouter.get('/lost-found/:itemId', async (req, res) => {
  res.json(await lostItemDetail(currentUser(req), id(req, 'itemId')));
});

campusRouter.post('/lost-found/:itemId/claims', async (req, res) => {
  res.json(await claimItem(currentUser(req), id(req, 'itemId'), req.body));
});

campusRouter.post('/lost-found/:itemId/resolve', async (req, res) => {
  res.json(await resolveItem(currentUser(req), id(req, 'itemId'), req.body));
});

campusRouter.delete('/lost-found/:itemId', async (req, res) => {
  res.json(await deleteItem(currentUser(req), id(req, 'itemId')));
});

// ---- Transport ----

campusRouter.get('/transport', async (req, res) => {
  res.json(await transportHome(currentUser(req)));
});

campusRouter.post('/transport/routes', async (req, res) => {
  res.status(201).json(await saveRoute(currentUser(req), req.body));
});

campusRouter.put('/transport/routes/:routeId', async (req, res) => {
  res.json(await saveRoute(currentUser(req), req.body, id(req, 'routeId')));
});

campusRouter.delete('/transport/routes/:routeId', async (req, res) => {
  res.json(await deleteRoute(currentUser(req), id(req, 'routeId')));
});

campusRouter.put('/transport/routes/:routeId/notice', async (req, res) => {
  res.json(await setRouteNotice(currentUser(req), id(req, 'routeId'), req.body));
});

campusRouter.put('/transport/routes/:routeId/saved', async (req, res) => {
  res.json(await setSavedRoute(currentUser(req), id(req, 'routeId'), req.body));
});

// ---- Map: offices and facilities ----

campusRouter.get('/places', async (req, res) => {
  res.json(await listPlaces(currentUser(req)));
});

campusRouter.post('/places', async (req, res) => {
  res.status(201).json(await savePlace(currentUser(req), req.body));
});

campusRouter.put('/places/:placeId', async (req, res) => {
  res.json(await savePlace(currentUser(req), req.body, id(req, 'placeId')));
});

campusRouter.delete('/places/:placeId', async (req, res) => {
  res.json(await deletePlace(currentUser(req), id(req, 'placeId')));
});
