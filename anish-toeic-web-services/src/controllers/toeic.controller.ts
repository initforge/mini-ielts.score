import { Request, Response } from 'express';
import { ToeicService } from '../services/toeic.service';
import { createAttemptSchema, updateResponseSchema, presignMediaSchema } from '../validations/toeic.validation';

// Mock getUserId since auth is not fully implemented
const getUserId = (req: Request) => req.headers['x-user-id'] as string || 'mock-user-id';

export class ToeicController {
  static async getExams(req: Request, res: Response) {
    try {
      const exams = await ToeicService.getExams(req.query);
      res.json(exams);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getExamBySlug(req: Request, res: Response) {
    try {
      const exam = await ToeicService.getExamBySlug(req.params.slug);
      if (!exam) return res.status(404).json({ error: 'Exam not found' });
      res.json(exam);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async createAttempt(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      const examId = parseInt(req.params.id, 10);
      const validated = createAttemptSchema.parse(req.body);
      
      const attempt = await ToeicService.createAttempt(userId, examId, validated.mode);
      res.status(201).json(attempt);
    } catch (error: any) {
      if (error.name === 'ZodError') return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: error.message });
    }
  }

  static async getAttempt(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      const attemptId = parseInt(req.params.id, 10);
      const attempt = await ToeicService.getAttempt(attemptId, userId);
      
      if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
      res.json(attempt);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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
    } catch (error: any) {
      if (error.name === 'ZodError') return res.status(400).json({ error: error.errors });
      if (error.message.includes('Unauthorized')) return res.status(403).json({ error: error.message });
      if (error.message.includes('Conflict')) return res.status(409).json({ error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  static async presignMedia(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      const attemptId = parseInt(req.params.id, 10);
      const validated = presignMediaSchema.parse(req.body);
      
      const result = await ToeicService.presignMedia(attemptId, userId, validated.questionId, validated.fileName, validated.fileType);
      res.json(result);
    } catch (error: any) {
      if (error.name === 'ZodError') return res.status(400).json({ error: error.errors });
      if (error.message.includes('Unauthorized')) return res.status(403).json({ error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  static async submitAttempt(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      const attemptId = parseInt(req.params.id, 10);
      
      const result = await ToeicService.submitAttempt(attemptId, userId);
      res.json(result);
    } catch (error: any) {
      if (error.message.includes('Unauthorized')) return res.status(403).json({ error: error.message });
      if (error.message.includes('Conflict')) return res.status(409).json({ error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  static async getGradingStatus(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      const attemptId = parseInt(req.params.id, 10);
      
      const status = await ToeicService.getGradingStatus(attemptId, userId);
      if (!status) return res.status(404).json({ error: 'Status not found' });
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getResult(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      const attemptId = parseInt(req.params.id, 10);
      
      const result = await ToeicService.getResult(attemptId, userId);
      if (!result) return res.status(404).json({ error: 'Result not found' });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getReview(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      const attemptId = parseInt(req.params.id, 10);
      
      const review = await ToeicService.getReview(attemptId, userId);
      if (!review) return res.status(404).json({ error: 'Review not found' });
      res.json(review);
    } catch (error: any) {
      if (error.message.includes('not available')) return res.status(403).json({ error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  static async getAttemptHistory(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      const history = await ToeicService.getAttemptHistory(userId);
      res.json(history);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}
