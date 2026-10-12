/**
 * Running a course: attendance, marks, assignments, materials and live quizzes. Every action is checked with
 * the access rules (the course's instructor or IT; the HOD and Exam Office may look).
 */
import { objectIdSchema, returnGradesSchema } from '@cui/shared';
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
  addMaterial,
  createAssignment,
  deleteAssignment,
  deleteMaterial,
  returnAssignmentGrades,
  saveAssignmentGrades,
  updateAssignment,
} from '../../services/coursework';
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
import {
  createQuiz,
  deleteQuiz,
  endQuiz,
  nextQuestion,
  revealAnswer,
  saveQuizMarks,
  startQuiz,
  updateQuiz,
} from '../../services/quizzes';

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

// ---- Assignments ----

teachingRouter.post('/courses/:offeringId/assignments', async (req, res) => {
  res.status(201).json(await createAssignment(currentUser(req), id(req, 'offeringId'), req.body));
});

teachingRouter.put('/assignments/:assignmentId', async (req, res) => {
  res.json(await updateAssignment(currentUser(req), id(req, 'assignmentId'), req.body));
});

teachingRouter.delete('/assignments/:assignmentId', async (req, res) => {
  await deleteAssignment(currentUser(req), id(req, 'assignmentId'));
  res.json({ ok: true });
});

teachingRouter.put('/assignments/:assignmentId/grades', async (req, res) => {
  res.json(await saveAssignmentGrades(currentUser(req), id(req, 'assignmentId'), req.body));
});

teachingRouter.post('/assignments/:assignmentId/return', async (req, res) => {
  const { returned } = parse(returnGradesSchema, req.body);
  await returnAssignmentGrades(currentUser(req), id(req, 'assignmentId'), returned);
  res.json({ ok: true });
});

// ---- Materials ----

teachingRouter.post('/courses/:offeringId/materials', async (req, res) => {
  res.status(201).json(await addMaterial(currentUser(req), id(req, 'offeringId'), req.body));
});

teachingRouter.delete('/materials/:materialId', async (req, res) => {
  await deleteMaterial(currentUser(req), id(req, 'materialId'));
  res.json({ ok: true });
});

// ---- Live quizzes ----

teachingRouter.post('/courses/:offeringId/quizzes', async (req, res) => {
  res.status(201).json(await createQuiz(currentUser(req), id(req, 'offeringId'), req.body));
});

teachingRouter.put('/quizzes/:quizId', async (req, res) => {
  res.json(await updateQuiz(currentUser(req), id(req, 'quizId'), req.body));
});

teachingRouter.delete('/quizzes/:quizId', async (req, res) => {
  await deleteQuiz(currentUser(req), id(req, 'quizId'));
  res.json({ ok: true });
});

// Running it: start (students are told), show the next question, show the answer early, end.
teachingRouter.post('/quizzes/:quizId/start', async (req, res) => {
  res.json(await startQuiz(currentUser(req), id(req, 'quizId')));
});

teachingRouter.post('/quizzes/:quizId/next', async (req, res) => {
  res.json(await nextQuestion(currentUser(req), id(req, 'quizId')));
});

teachingRouter.post('/quizzes/:quizId/reveal', async (req, res) => {
  res.json(await revealAnswer(currentUser(req), id(req, 'quizId')));
});

teachingRouter.post('/quizzes/:quizId/end', async (req, res) => {
  res.json(await endQuiz(currentUser(req), id(req, 'quizId')));
});

teachingRouter.post('/quizzes/:quizId/marks', async (req, res) => {
  res.json(await saveQuizMarks(currentUser(req), id(req, 'quizId')));
});
