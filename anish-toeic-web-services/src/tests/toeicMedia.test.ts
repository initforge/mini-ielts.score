import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import toeicRoutes from '../routes/toeic.routes';
import { pool } from '../services/db.service';
import { resetMediaAdapter } from '../services/media.adapter';

jest.mock('../services/db.service', () => ({
  pool: {
    query: jest.fn(),
    getConnection: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use('/api', toeicRoutes);

const SECRET = process.env.JWT_SECRET as string;
const ownerToken = jwt.sign({ sub: '1' }, SECRET);
const otherToken = jwt.sign({ sub: '2' }, SECRET);

const VALID_PRESIGN_BODY = {
  questionId: 101,
  fileName: 'recording.webm',
  fileType: 'audio/webm',
  fileSize: 1024000,
};

describe('S5-BE — Media upload presigning (AC15-BE)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the media adapter singleton so each test gets a fresh test adapter
    resetMediaAdapter();
  });

  // ── Positive cases ────────────────────────────────────────────────

  it('generates a presigned upload URL and records the s3_key placeholder', async () => {
    const mockQuery = pool.query as jest.Mock;
    // 1st query: attempt ownership check
    mockQuery.mockResolvedValueOnce([[{ id: 1, status: 'IN_PROGRESS', exam_id: 10 }]]);
    // 2nd query: question membership check
    mockQuery.mockResolvedValueOnce([[{ id: 101 }]]);
    // 3rd query: INSERT INTO toeic_attempt_media
    mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app)
      .post('/api/toeic-attempts/1/media/presign')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(VALID_PRESIGN_BODY);

    expect(res.status).toBe(200);
    expect(res.body.uploadUrl).toContain('https://');
    expect(res.body.s3Key).toContain('uploads/attempts/1/q101/recording.webm');
    expect(res.body.expiresAt).toBeTruthy();
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const insertCall = mockQuery.mock.calls.find((c: string[]) =>
      c[0].includes('INSERT INTO toeic_attempt_media')
    );
    expect(insertCall).toBeDefined();
  });

  it('handles various allowed audio MIME types', async () => {
    const allowedTypes = [
      'audio/webm',
      'audio/webm;codecs=opus',
      'audio/mp4',
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      'audio/x-m4a',
      'audio/3gpp',
    ];

    for (const fileType of allowedTypes) {
      jest.clearAllMocks();
      resetMediaAdapter();

      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce([[{ id: 1, status: 'IN_PROGRESS', exam_id: 10 }]]);
      mockQuery.mockResolvedValueOnce([[{ id: 101 }]]);
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const res = await request(app)
        .post('/api/toeic-attempts/1/media/presign')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ ...VALID_PRESIGN_BODY, fileType });

      expect(res.status).toBe(200);
    }
  });

  it('handles different allowed file name extensions', async () => {
    const allowedFileNames = [
      'recording.webm',
      'audio.mp3',
      'voice.wav',
      'clip.ogg',
      'record.m4a',
      'sample.3gp',
      'recording.opus',
    ];

    for (const fileName of allowedFileNames) {
      jest.clearAllMocks();
      resetMediaAdapter();

      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce([[{ id: 1, status: 'IN_PROGRESS', exam_id: 10 }]]);
      mockQuery.mockResolvedValueOnce([[{ id: 101 }]]);
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const res = await request(app)
        .post('/api/toeic-attempts/1/media/presign')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ ...VALID_PRESIGN_BODY, fileName });

      expect(res.status).toBe(200);
    }
  });

  // ── Auth / ownership ───────────────────────────────────────────────

  it('returns 401 without a token', async () => {
    const res = await request(app)
      .post('/api/toeic-attempts/1/media/presign')
      .send(VALID_PRESIGN_BODY);

    expect(res.status).toBe(401);
  });

  it('returns 403 for another user attempt', async () => {
    const mockQuery = pool.query as jest.Mock;
    mockQuery.mockResolvedValueOnce([[]]); // attempt not found / not owned

    const res = await request(app)
      .post('/api/toeic-attempts/1/media/presign')
      .set('Authorization', `Bearer ${otherToken}`)
      .send(VALID_PRESIGN_BODY);

    expect(res.status).toBe(403);
  });

  // ── Membership validation ──────────────────────────────────────────

  it('returns 409 if question does not belong to the attempt exam', async () => {
    const mockQuery = pool.query as jest.Mock;
    mockQuery.mockResolvedValueOnce([[{ id: 1, status: 'IN_PROGRESS', exam_id: 10 }]]);
    mockQuery.mockResolvedValueOnce([[]]); // question not in exam

    const res = await request(app)
      .post('/api/toeic-attempts/1/media/presign')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...VALID_PRESIGN_BODY, questionId: 999 });

    expect(res.status).toBe(409);
  });

  // ── Attempt state ──────────────────────────────────────────────────

  it('returns 409 if attempt is not IN_PROGRESS', async () => {
    const mockQuery = pool.query as jest.Mock;
    mockQuery.mockResolvedValueOnce([[{ id: 1, status: 'SUBMITTED', exam_id: 10 }]]);

    const res = await request(app)
      .post('/api/toeic-attempts/1/media/presign')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(VALID_PRESIGN_BODY);

    expect(res.status).toBe(409);
  });

  // ── Validation: fileName ───────────────────────────────────────────

  it('rejects fileName with path separators (directory traversal)', async () => {
    const traversalAttempts = [
      '../../../etc/passwd',
      '..\\windows\\system32',
      'audio/../../secret',
      './config',
    ];

    for (const fileName of traversalAttempts) {
      const res = await request(app)
        .post('/api/toeic-attempts/1/media/presign')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ ...VALID_PRESIGN_BODY, fileName });

      expect(res.status).toBe(400);
    }
  });

  it('rejects fileName with unsafe extensions', async () => {
    const unsafeNames = [
      'script.js',
      'file.exe',
      'page.html',
      'config.xml',
      'recording.mp4.exe',
    ];

    for (const fileName of unsafeNames) {
      const res = await request(app)
        .post('/api/toeic-attempts/1/media/presign')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ ...VALID_PRESIGN_BODY, fileName });

      expect(res.status).toBe(400);
    }
  });

  it('rejects empty or missing fileName', async () => {
    const res = await request(app)
      .post('/api/toeic-attempts/1/media/presign')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...VALID_PRESIGN_BODY, fileName: '' });

    expect(res.status).toBe(400);
  });

  it('rejects fileName exceeding 255 characters', async () => {
    const longName = 'a'.repeat(260) + '.webm';

    const res = await request(app)
      .post('/api/toeic-attempts/1/media/presign')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...VALID_PRESIGN_BODY, fileName: longName });

    expect(res.status).toBe(400);
  });

  // ── Validation: fileType ───────────────────────────────────────────

  it('rejects non-audio MIME types', async () => {
    const badTypes = [
      'application/json',
      'text/html',
      'image/png',
      'application/octet-stream',
      'application/x-msdownload',
    ];

    for (const fileType of badTypes) {
      const res = await request(app)
        .post('/api/toeic-attempts/1/media/presign')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ ...VALID_PRESIGN_BODY, fileType });

      expect(res.status).toBe(400);
    }
  });

  it('rejects empty fileType', async () => {
    const res = await request(app)
      .post('/api/toeic-attempts/1/media/presign')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...VALID_PRESIGN_BODY, fileType: '' });

    expect(res.status).toBe(400);
  });

  // ── Validation: fileSize ───────────────────────────────────────────

  it('rejects fileSize exceeding MAX_MEDIA_FILE_SIZE_BYTES (25 MB)', async () => {
    const res = await request(app)
      .post('/api/toeic-attempts/1/media/presign')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...VALID_PRESIGN_BODY, fileSize: 26 * 1024 * 1024 + 1 });

    expect(res.status).toBe(400);
  });

  it('rejects non-integer fileSize', async () => {
    const res = await request(app)
      .post('/api/toeic-attempts/1/media/presign')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...VALID_PRESIGN_BODY, fileSize: 123.5 });

    expect(res.status).toBe(400);
  });

  it('rejects zero or negative fileSize', async () => {
    const res = await request(app)
      .post('/api/toeic-attempts/1/media/presign')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...VALID_PRESIGN_BODY, fileSize: 0 });

    expect(res.status).toBe(400);
  });

  it('rejects missing fileSize', async () => {
    const body = { questionId: 101, fileName: 'recording.webm', fileType: 'audio/webm' };

    const res = await request(app)
      .post('/api/toeic-attempts/1/media/presign')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(body);

    expect(res.status).toBe(400);
  });

  // ── Base64 / data leakage prevention ───────────────────────────────

  it('rejects base64 data URI in the content field', async () => {
    const base64Data = 'data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAACJxN';

    const res = await request(app)
      .post('/api/toeic-attempts/1/media/presign')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...VALID_PRESIGN_BODY, content: base64Data });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('rejects raw base64 string (100+ chars of base64 chars) as content', async () => {
    // Generate 200 chars of valid base64
    const rawBase64 = Buffer.from('x'.repeat(150)).toString('base64');

    const res = await request(app)
      .post('/api/toeic-attempts/1/media/presign')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...VALID_PRESIGN_BODY, content: rawBase64 });

    expect(res.status).toBe(400);
  });

  it('rejects base64 data URI in unexpected fields', async () => {
    const base64Data = 'data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAACJxN';

    const res = await request(app)
      .post('/api/toeic-attempts/1/media/presign')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        questionId: 101,
        fileName: base64Data, // base64 where fileName expected
        fileType: 'audio/webm',
        fileSize: 1024000,
      });

    expect(res.status).toBe(400);
  });

  // ── questionId validation ──────────────────────────────────────────

  it('rejects non-numeric questionId', async () => {
    const res = await request(app)
      .post('/api/toeic-attempts/1/media/presign')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...VALID_PRESIGN_BODY, questionId: 'abc' });

    expect(res.status).toBe(400);
  });

  it('rejects negative questionId', async () => {
    const res = await request(app)
      .post('/api/toeic-attempts/1/media/presign')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...VALID_PRESIGN_BODY, questionId: -1 });

    expect(res.status).toBe(400);
  });
});
