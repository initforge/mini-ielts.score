import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { AdminMixedExamController } from '../controllers/admin-mixed-exam.controller';
import { AdminResultController } from '../controllers/admin-result.controller';
import { AdminImportController } from '../controllers/admin-import.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { requireAdmin } from '../middlewares/rbac.middleware';
import { requireExamEditor, requireResultManager, requireAuditor } from '../middlewares/capability.middleware';

const router = Router();

router.use(requireAuth);
router.use(requireAdmin);

// Exam lifecycle routes.
router.get('/exams', AdminController.getExams);
router.patch('/exams/:id/lifecycle', AdminController.publishArchive);
router.get('/exams/:id/snapshot', AdminController.getSnapshot);

// Mixed exam routes (require EXAM_EDITOR capability).
router.post('/mixed-exams', requireExamEditor, AdminMixedExamController.create);
router.get('/mixed-exams/:id', requireExamEditor, AdminMixedExamController.get);
router.patch('/mixed-exams/:id/sources', requireExamEditor, AdminMixedExamController.updateSources);
router.post('/mixed-exams/:id/publish', requireExamEditor, AdminMixedExamController.publish);

// Result routes (require RESULT_MANAGER capability).
router.get('/results', requireResultManager, AdminResultController.list);
router.get('/results/:attemptId', requireResultManager, AdminResultController.getDetail);
router.post('/results/:attemptId/regrade', requireResultManager, AdminResultController.regrade);
router.post('/results/:attemptId/override', requireResultManager, AdminResultController.override);
router.post('/results/:attemptId/restore', requireResultManager, AdminResultController.restore);

// Result audit (requires AUDITOR capability).
router.get('/results/:attemptId/audit', requireAuditor, AdminResultController.getAuditLog);

// Import job routes (require EXAM_EDITOR capability).
// Workflow: create → confirm-upload → inspect → finalize | cancel
router.get('/import/jobs', requireExamEditor, AdminImportController.listJobs);
router.post('/import/jobs', requireExamEditor, AdminImportController.createJob);
router.get('/import/jobs/:id', requireExamEditor, AdminImportController.getJob);
router.post('/import/jobs/:id/confirm-upload', requireExamEditor, AdminImportController.confirmUpload);
router.post('/import/jobs/:id/inspect', requireExamEditor, AdminImportController.inspectJob);
router.post('/import/jobs/:id/finalize', requireExamEditor, AdminImportController.finalizeJob);
router.delete('/import/jobs/:id', requireExamEditor, AdminImportController.cancelJob);

// General audit routes.
router.get('/audit', AdminController.getAuditLog);

export default router;
