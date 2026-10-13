/**
 * File uploads and downloads. The browser sends the raw bytes (`application/octet-stream`) with
 * the name in `x-file-name`; the purpose and course come in the query, and decide who may upload
 * and, later, who may download.
 */
import { FILE_PURPOSES, formatBytes, MAX_FILE_BYTES, objectIdSchema } from '@cui/shared';
import express, { type ErrorRequestHandler, Router } from 'express';
import { z } from 'zod';
import { currentUser } from '../../auth/middleware';
import { badRequest, parse } from '../../lib/errors';
import { contentDisposition, discardFile, openFile, uploadFile } from '../../services/files';

export const filesRouter = Router();

const uploadQuerySchema = z.object({
  purpose: z.enum(FILE_PURPOSES),
  /** Every purpose but lost & found photos belongs to a course. */
  offeringId: objectIdSchema.optional(),
});

filesRouter.post(
  '/',
  express.raw({ type: () => true, limit: MAX_FILE_BYTES }),
  async (req, res) => {
    const query = parse(uploadQuerySchema, req.query);
    const name = req.get('x-file-name');
    if (!name) throw badRequest('The file name is missing.');
    if (!Buffer.isBuffer(req.body)) throw badRequest('The file is empty.');
    res.status(201).json(await uploadFile(currentUser(req), { ...query, name }, req.body));
  },
);

filesRouter.get('/:fileId', async (req, res, next) => {
  const fileId = parse(objectIdSchema, req.params.fileId);
  const { file, inline, stream } = await openFile(currentUser(req), fileId);
  res.set({
    'content-type': file.type,
    'content-length': String(file.size),
    'content-disposition': contentDisposition(file.name, inline),
    // Files never change (a new upload is a new file); keep them out of shared caches.
    'cache-control': 'private, max-age=86400, immutable',
    // Even an image opened directly runs nothing.
    'content-security-policy':
      "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
  });
  stream.on('error', next).pipe(res);
});

filesRouter.delete('/:fileId', async (req, res) => {
  await discardFile(currentUser(req), parse(objectIdSchema, req.params.fileId));
  res.json({ ok: true });
});

/** A friendlier message than the generic "body too large". */
export const uploadTooLarge: ErrorRequestHandler = (err, _req, res, next) => {
  if ((err as { type?: string }).type === 'entity.too.large') {
    res.status(413).json({
      error: {
        code: 'VALIDATION',
        message: `Files can be at most ${formatBytes(MAX_FILE_BYTES)}.`,
      },
    });
    return;
  }
  next(err);
};
filesRouter.use(uploadTooLarge);
