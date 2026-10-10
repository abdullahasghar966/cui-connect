import { markNotificationsSchema, notificationsQuerySchema } from '@cui/shared';
import { Router } from 'express';
import { currentUser } from '../../auth/middleware';
import { parse } from '../../lib/errors';
import { listNotifications, markNotifications } from '../../services/notifications';

/** The signed-in person's own notifications (nobody can read anyone else's). */
export const notificationsRouter = Router();

notificationsRouter.get('/', async (req, res) => {
  res.json(await listNotifications(currentUser(req), parse(notificationsQuerySchema, req.query)));
});

notificationsRouter.post('/read', async (req, res) => {
  res.json(await markNotifications(currentUser(req), parse(markNotificationsSchema, req.body)));
});
