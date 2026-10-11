/**
 * Running a course: attendance now, marks and coursework later. Every action is checked with
 * the access rules (the course's instructor or IT; the HOD and Exam Office may look).
 */
import { objectIdSchema } from '@cui/shared';
import { type Request, Router } from 'express';
import { currentUser } from '../../auth/middleware';
import { parse } from '../../lib/errors';
import {
  attendanceSheet,
  closeSession,
  markStudent,
  sessionDetail,
  sessionQr,
  startSession,
  teachingCourses,
} from '../../services/attendance';
import {
  createAssessment,
  deleteAssessment,
  finalizeCourse,
  marksSheet,
  publishAssessment,
  saveMarks,
  setGrading,
  updateAssessment,
} from '../../services/marks';

export const teachingRouter = Router();

const id = (req: Request, name: string) => parse(objectIdSchema, req.params[name]);

teachingRouter.get('/courses', async (req, res) => {
  res.json(await teachingCourses(currentUser(req)));
});

teachingRouter.get('/courses/:offeringId/attendance', async (req, res) => {
  res.json(await attendanceSheet(currentUser(req), id(req, 'offeringId')));
});

// ---- Marks ----

teachingRouter.get('/courses/:offeringId/marks', async (req, res) => {
  res.json(await marksSheet(currentUser(req), id(req, 'offeringId')));
});

teachingRouter.post('/courses/:offeringId/assessments', async (req, res) => {
  res.status(201).json(await createAssessment(currentUser(req), id(req, 'offeringId'), req.body));
});

teachingRouter.put('/courses/:offeringId/grading', async (req, res) => {
  res.json(await setGrading(currentUser(req), id(req, 'offeringId'), req.body));
});

teachingRouter.post('/courses/:offeringId/finalize', async (req, res) => {
  res.json(await finalizeCourse(currentUser(req), id(req, 'offeringId')));
});

teachingRouter.put('/assessments/:assessmentId', async (req, res) => {
  await updateAssessment(currentUser(req), id(req, 'assessmentId'), req.body);
  res.json({ ok: true });
});

teachingRouter.delete('/assessments/:assessmentId', async (req, res) => {
  await deleteAssessment(currentUser(req), id(req, 'assessmentId'));
  res.json({ ok: true });
});

teachingRouter.put('/assessments/:assessmentId/marks', async (req, res) => {
  res.json(await saveMarks(currentUser(req), id(req, 'assessmentId'), req.body));
});

teachingRouter.post('/assessments/:assessmentId/publish', async (req, res) => {
  await publishAssessment(currentUser(req), id(req, 'assessmentId'), true);
  res.json({ ok: true });
});

teachingRouter.post('/assessments/:assessmentId/unpublish', async (req, res) => {
  await publishAssessment(currentUser(req), id(req, 'assessmentId'), false);
  res.json({ ok: true });
});

// ---- Attendance ----

teachingRouter.post('/attendance', async (req, res) => {
  res.status(201).json(await startSession(currentUser(req), req.body));
});

teachingRouter.get('/attendance/:sessionId', async (req, res) => {
  res.json(await sessionDetail(currentUser(req), id(req, 'sessionId')));
});

teachingRouter.get('/attendance/:sessionId/qr', async (req, res) => {
  res.set('cache-control', 'no-store');
  res.json(await sessionQr(currentUser(req), id(req, 'sessionId')));
});

teachingRouter.put('/attendance/:sessionId/students/:studentId', async (req, res) => {
  res.json(
    await markStudent(currentUser(req), id(req, 'sessionId'), id(req, 'studentId'), req.body),
  );
});

teachingRouter.post('/attendance/:sessionId/close', async (req, res) => {
  res.json(await closeSession(currentUser(req), id(req, 'sessionId')));
});
