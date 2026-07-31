import { Request, Response } from 'express';
import { ToeicService } from '../services/toeic.service';
import {
  createAttemptSchema,
  updateResponseSchema,
  presignMediaSchema,
  catalogQuerySchema,
} from '../validations/toeic.validation';
import { HttpError } from '../errors/http.error';

function getUserId(req: Request): string {
  const userId = req.user?.id;
  if (!userId) throw new HttpError(401, 'Unauthorized');
  return userId;
}

function sendError(res: Response, err: unknown) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((err as any)?.name === 'ZodError') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return res.status(400).json({ error: (err as any).errors });
  }
  console.error('[toeic] request failed:', err);
  return res.status(500).json({ error: 'Internal server error' });
}

export class ToeicController {
  static async getExams(req: Request, res: Response) {
    try {
      const query = catalogQuerySchema.parse(req.query);
      const filters = {
        search: query.search,
        skillType: query.skillType,
        collectionId: query.collectionId,
        page: query.page ? parseInt(query.page, 10) : undefined,
        pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
      };
      const exams = await ToeicService.getExams(filters);
      res.json(exams);
    } catch (err: unknown) {
      sendError(res, err);
    }
  }

  static async getExamBySlug(req: Request, res: Response) {
    try {
      const exam = await ToeicService.getExamBySlug(req.params.slug);
      if (!exam) return res.status(404).json({ error: 'Exam not found' });
      res.json(exam);
    } catch (err: unknown) {
      sendError(res, err);
    }
  }

  static async createAttempt(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      const examId = parseInt(req.params.id, 10);
      if (!Number.isInteger(examId) || examId <= 0) {
        return res.status(400).json({ error: 'Invalid exam id' });
      }
      const validated = createAttemptSchema.parse(req.body);

      const attempt = await ToeicService.createAttempt(userId, examId, validated.mode);
      res.status(201).json(attempt);
    } catch (err: unknown) {
      sendError(res, err);
    }
  }

  static async getAttempt(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      const attemptId = parseInt(req.params.id, 10);
      const attempt = await ToeicService.getAttempt(attemptId, userId);

      if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
      res.json(attempt);
    } catch (err: unknown) {
      sendError(res, err);
    }
  }

  static async updateResponse(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      const attemptId = parseInt(req.params.id, 10);
      const questionId = parseInt(req.params.questionId, 10);
      const validated = updateResponseSchema.parse(req.body);

      const result = await ToeicService.updateResponse(attemptId, userId, questionId, validated);
      res.json(result);
    } catch (err: unknown) {
      sendError(res, err);
    }
  }

  static async presignMedia(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      const attemptId = parseInt(req.params.id, 10);
      const validated = presignMediaSchema.parse(req.body);

      const result = await ToeicService.presignMedia(
        attemptId,
        userId,
        validated.questionId,
        validated.fileName,
        validated.fileType,
        validated.fileSize,
      );
      res.json(result);
    } catch (err: unknown) {
      sendError(res, err);
    }
  }

  static async submitAttempt(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      const attemptId = parseInt(req.params.id, 10);

      const result = await ToeicService.submitAttempt(attemptId, userId);
      res.json(result);
    } catch (err: unknown) {
      sendError(res, err);
    }
  }

  static async getGradingStatus(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      const attemptId = parseInt(req.params.id, 10);

      const status = await ToeicService.getGradingStatus(attemptId, userId);
      if (!status) return res.status(404).json({ error: 'Status not found' });
      res.json(status);
    } catch (err: unknown) {
      sendError(res, err);
    }
  }

  static async getResult(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      const attemptId = parseInt(req.params.id, 10);

      const result = await ToeicService.getResult(attemptId, userId);
      if (!result) return res.status(404).json({ error: 'Result not found' });
      res.json(result);
    } catch (err: unknown) {
      sendError(res, err);
    }
  }

  static async getReview(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      const attemptId = parseInt(req.params.id, 10);

      const review = await ToeicService.getReview(attemptId, userId);
      if (!review) return res.status(404).json({ error: 'Review not found' });
      res.json(review);
    } catch (err: unknown) {
      sendError(res, err);
    }
  }

  static async getAttemptHistory(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      const history = await ToeicService.getAttemptHistory(userId);
      res.json(history);
    } catch (err: unknown) {
      sendError(res, err);
    }
  }
}
