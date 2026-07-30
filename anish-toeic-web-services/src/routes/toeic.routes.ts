import { Router } from 'express';
import { ToeicController } from '../controllers/toeic.controller';

const router = Router();

// Public routes
router.get('/toeic-exams', ToeicController.getExams);
router.get('/toeic-exams/:slug', ToeicController.getExamBySlug);

// Authenticated / Owner routes
// (In a real application, an authentication middleware would be added before these routes)
router.post('/toeic-exams/:id/attempts', ToeicController.createAttempt);
router.get('/toeic-attempts', ToeicController.getAttemptHistory);
router.get('/toeic-attempts/:id', ToeicController.getAttempt);
router.patch('/toeic-attempts/:id/responses/:questionId', ToeicController.updateResponse);
router.post('/toeic-attempts/:id/media/presign', ToeicController.presignMedia);
router.post('/toeic-attempts/:id/submit', ToeicController.submitAttempt);
router.get('/toeic-attempts/:id/grading-status', ToeicController.getGradingStatus);
router.get('/toeic-attempts/:id/result', ToeicController.getResult);
router.get('/toeic-attempts/:id/review', ToeicController.getReview);

export default router;
