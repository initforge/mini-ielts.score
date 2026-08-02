/**
 * Admin Import Controller Tests.
 * Tests the import job workflow: create → confirm-upload → inspect → finalize | cancel.
 *
 * Coverage:
 * - Valid DOCX produces DRAFT tree on finalize
 * - Malicious inputs reject with no partial tree/READY asset
 * - ZIP media mapping validates names/types/hash
 * - Role capability EXAM_EDITOR required
 * - Transaction rollback on failure
 * - Domain separation: DOCX package not recording/listening
 */

import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import adminRoutes from '../routes/admin.routes';
import { pool } from '../services/db.service';

// Mock ioredis.
jest.mock('ioredis', () => {
  return {
    Redis: jest.fn(() => ({
      setex: jest.fn().mockResolvedValue('OK'),
      exists: jest.fn().mockResolvedValue(0),
      del: jest.fn().mockResolvedValue(1),
      set: jest.fn(),
      get: jest.fn(),
      quit: jest.fn(),
    })),
  };
});

jest.mock('../services/db.service', () => ({
  pool: {
    query: jest.fn(),
    getConnection: jest.fn(),
  },
}));

const app = express();
app.use(express.json({ limit: '100mb' }));
app.use('/api/admin', adminRoutes);

const SECRET = process.env.JWT_SECRET as string;
const examEditorToken = jwt.sign({ sub: '1' }, SECRET);
const nonEditorToken = jwt.sign({ sub: '3' }, SECRET);

function q() {
  return pool.query as jest.Mock;
}

function mockConnection() {
  const mockConn = {
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn(),
  };
  (pool.getConnection as jest.Mock).mockResolvedValue(mockConn);
  return mockConn;
}

// Helper to setup EXAM_EDITOR mocks.
function setupExamEditorMocks() {
  // requireAdmin: check if user is in admin_users table.
  q().mockResolvedValueOnce([[{ id: 1 }]]);
  // requireCapability: check EXAM_EDITOR role.
  q().mockResolvedValueOnce([[{ role_name: 'EXAM_EDITOR' }]]);
}

describe('Admin Import AC', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    q().mockResolvedValue([[]]);
  });

  // -----------------------------------------------------------------------
  // AC1: Valid DOCX produces DRAFT tree on finalize
  // -----------------------------------------------------------------------
  describe('AC1: Valid DOCX produces DRAFT tree on finalize', () => {
    it('creates job with presigned URL', async () => {
      setupExamEditorMocks();
      const mockConn = mockConnection();
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]);
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]);

      const res = await request(app)
        .post('/api/admin/import/jobs')
        .set('Authorization', `Bearer ${examEditorToken}`)
        .send({
          title: 'Test Import',
          fileName: 'test.docx',
          fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          fileSizeBytes: 1024,
        });

      expect(res.status).toBe(201);
      expect(res.body.jobId).toBe(1);
      expect(res.body.uploadUrl).toBeDefined();
    });

    it('finalize creates DRAFT exam with READY status', async () => {
      setupExamEditorMocks();
      const mockConn = mockConnection();

      // Job lookup.
      mockConn.query.mockResolvedValueOnce([[{
        id: 1,
        title: 'Test Import',
        status: 'INSPECTING',
        file_name: 'test.docx',
        file_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        file_size_bytes: 1024,
        inspection_result: JSON.stringify({ valid: true, mediaCount: 0, warnings: [], errors: [], media: [], examPreview: null }),
        actor_user_id: 1,
        cancelled_at: null,
      }]]);
      // Transition to FINALIZING.
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      // Exam insert.
      mockConn.query.mockResolvedValueOnce([{ insertId: 100 }]);
      // Section insert.
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]);
      // Job update.
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      // Audit.
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]);

      const res = await request(app)
        .post('/api/admin/import/jobs/1/finalize')
        .set('Authorization', `Bearer ${examEditorToken}`)
        .send({
          collectionId: 1,
          skillType: 'LR',
          durationMinutes: 60,
        });

      expect(res.status).toBe(200);
      expect(res.body.examId).toBe(100);
    });
  });

  // -----------------------------------------------------------------------
  // AC2: Malicious inputs reject and no partial tree/READY asset
  // -----------------------------------------------------------------------
  describe('AC2: Malicious inputs reject and no partial tree/READY asset', () => {
    it('rejects ZIP slip attack', async () => {
      setupExamEditorMocks();
      const mockConn = mockConnection();

      mockConn.query.mockResolvedValueOnce([[{
        id: 1,
        status: 'INSPECTING',
        file_name: 'malicious.zip',
        file_type: 'application/zip',
        inspection_result: null,
        actor_user_id: 1,
        cancelled_at: null,
      }]]);

      // Test docx-import.service directly.
      const { inspectArchive } = await import('../services/docx-import.service');
      const maliciousBuffer = Buffer.from('PK' + '\x03\x04' + '../etc/passwd');
      const result = await inspectArchive(maliciousBuffer, 'application/zip', 'evil.zip');

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('path traversal'))).toBe(true);
    });

    it('rejects corrupt ZIP', async () => {
      const { inspectArchive } = await import('../services/docx-import.service');
      const corruptBuffer = Buffer.from('This is not a valid ZIP file');
      const result = await inspectArchive(corruptBuffer, 'application/zip', 'corrupt.zip');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('rejects external relationships', async () => {
      const { inspectArchive } = await import('../services/docx-import.service');
      // Create ZIP with external relationship.
      const zipBuffer = createMinimalZipFixture([{
        name: '_rels/.rels',
        content: '<?xml version="1.0"?><Relationships><Relationship Target="https://evil.com" TargetMode="External"/></Relationships>',
      }]);
      const result = await inspectArchive(zipBuffer, 'application/zip', 'external-rel.zip');

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('External relationship'))).toBe(true);
    });

    it('rejects OLE/macro signatures', async () => {
      const { inspectArchive } = await import('../services/docx-import.service');
      // Create buffer with OLE signature.
      const oleBuffer = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
      const zipBuffer = Buffer.concat([Buffer.from('PK\x03\x04'), oleBuffer]);
      const result = await inspectArchive(zipBuffer, 'application/zip', 'macro.zip');

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('OLE') || e.includes('macro'))).toBe(true);
    });

    it('rejects MIME/extension mismatch', async () => {
      setupExamEditorMocks();

      const res = await request(app)
        .post('/api/admin/import/jobs')
        .set('Authorization', `Bearer ${examEditorToken}`)
        .send({
          title: 'Test',
          fileName: 'test.docx',
          fileType: 'application/zip', // Wrong MIME type for .docx
          fileSizeBytes: 1024,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('extension does not match');
    });

    it('no partial tree on failed inspection', async () => {
      setupExamEditorMocks();
      const mockConn = mockConnection();

      // Job in INSPECTING status but inspection failed.
      mockConn.query.mockResolvedValueOnce([[{
        id: 1,
        status: 'INSPECTING',
        file_name: 'evil.docx',
        file_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        inspection_result: JSON.stringify({
          valid: false,
          errors: ['Contains macro content'],
          warnings: [],
          media: [],
          mediaCount: 0,
        }),
        actor_user_id: 1,
        cancelled_at: null,
      }]]);

      const res = await request(app)
        .post('/api/admin/import/jobs/1/finalize')
        .set('Authorization', `Bearer ${examEditorToken}`)
        .send({
          collectionId: 1,
          skillType: 'LR',
          durationMinutes: 60,
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('failed inspection');
      // Verify no exam was created.
      expect(mockConn.query.mock.calls.filter(c => c[0].includes('toeic_exams'))).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // AC3: ZIP media mapping validates names/types/hash
  // -----------------------------------------------------------------------
  describe('AC3: ZIP media mapping validates names/types/hash', () => {
    it('validates media file names for path traversal', async () => {
      const { validateMediaFileName } = await import('../services/import-media.adapter');

      expect(() => validateMediaFileName('../../../etc/passwd')).toThrow('path traversal');
      expect(() => validateMediaFileName('/absolute/path')).toThrow('absolute path');
      expect(() => validateMediaFileName('valid/name.txt')).not.toThrow();
    });

    it('validates media MIME types', async () => {
      const { isAllowedMediaType } = await import('../services/import-media.adapter');

      expect(isAllowedMediaType('audio/mpeg')).toBe(true);
      expect(isAllowedMediaType('image/png')).toBe(true);
      expect(isAllowedMediaType('application/octet-stream')).toBe(false);
      expect(isAllowedMediaType('application/x-executable')).toBe(false);
    });

    it('computes correct hash', async () => {
      const { computeHash } = await import('../services/import-media.adapter');
      const buffer = Buffer.from('test content');
      const hash = computeHash(buffer);

      // ponytail: correct SHA256 of 'test content' per test canonical fixture.
      expect(hash).toBe('6ae8a75555209fd6c44157c0aed8016e763ff435a19cf186f76863140143ff72');
    });
  });

  // -----------------------------------------------------------------------
  // AC4: Domain separation — DOCX not recording/listening, import media tagged
  // -----------------------------------------------------------------------
  describe('AC4: Domain separation', () => {
    it('import jobs use import-media domain tag', async () => {
      setupExamEditorMocks();
      const mockConn = mockConnection();

      // Verify domain_tag is set to 'import-media'.
      mockConn.query.mockImplementation((sql: string, params?: unknown[]) => {
        if (sql.includes('INSERT INTO import_jobs') && params) {
          expect(params).toContain('import-media');
        }
        return Promise.resolve([{ insertId: 1 }]);
      });
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]);
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]);

      await request(app)
        .post('/api/admin/import/jobs')
        .set('Authorization', `Bearer ${examEditorToken}`)
        .send({
          title: 'Test',
          fileName: 'test.docx',
          fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          fileSizeBytes: 1024,
        });
    });
  });

   // -----------------------------------------------------------------------
   // AC5: EXAM_EDITOR capability required
   // -----------------------------------------------------------------------
   describe('AC5: EXAM_EDITOR capability required', () => {
     it('rejects import without EXAM_EDITOR capability', async () => {
       // Non-editor user (not in admin_users, no EXAM_EDITOR role).
       q().mockResolvedValueOnce([[]]); // admin check fails
       q().mockResolvedValueOnce([[]]); // capability check fails

       const res = await request(app)
         .post('/api/admin/import/jobs')
         .set('Authorization', `Bearer ${nonEditorToken}`)
         .send({
           title: 'Test',
           fileName: 'test.docx',
           fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
           fileSizeBytes: 1024,
         });

       expect(res.status).toBe(403);
     });
   });

   // -----------------------------------------------------------------------
   // AC8: confirmUpload/inspect use server-controlled S3 retrieval
   // -----------------------------------------------------------------------
   describe('AC8: Server-controlled S3/MinIO retrieval by job storage key', () => {
     it('confirmUpload does not require fileBuffer in request body', async () => {
       setupExamEditorMocks();
       const mockConn = mockConnection();

       mockConn.query.mockResolvedValueOnce([[{
         id: 1,
         status: 'UPLOADING',
         file_name: 'test.docx',
         file_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         actor_user_id: 1,
         cancelled_at: null,
         s3_prefix: 'import-media/jobs/1/test.docx',
       }]]);
       mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
       mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]);

       // No fileBuffer in request body — only jobId and sha256Hash.
       const res = await request(app)
         .post('/api/admin/import/jobs/1/confirm-upload')
         .set('Authorization', `Bearer ${examEditorToken}`)
         .send({
           jobId: 1,
           sha256Hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
         });

       // The request should reach the service layer (may fail at hash verification
       // since mock storage returns dummy content, but it should NOT fail with
       // "File buffer required" which was the old error).
       expect(res.status).not.toBe(400);
       expect(res.body.error).not.toContain('File buffer');
     });

     it('inspectJob does not require fileBuffer in request body', async () => {
       setupExamEditorMocks();
       const mockConn = mockConnection();

       mockConn.query.mockResolvedValueOnce([[{
         id: 1,
         status: 'INSPECTING',
         file_name: 'test.docx',
         file_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         actor_user_id: 1,
         cancelled_at: null,
         s3_prefix: 'import-media/jobs/1/test.docx',
         inspection_result: null,
       }]]);

       // No fileBuffer in request body — the controller should retrieve from storage.
       const res = await request(app)
         .post('/api/admin/import/jobs/1/inspect')
         .set('Authorization', `Bearer ${examEditorToken}`);

       // The request should reach the service layer (may fail at storage retrieval
       // since mock storage throws, but it should NOT fail with "File buffer required").
       expect(res.status).not.toBe(400);
       expect(res.body.error).not.toContain('File buffer');
     });

     it('rejects when storage object is missing (no req.fileBuffer fallback)', async () => {
       setupExamEditorMocks();
       const mockConn = mockConnection();

       mockConn.query.mockResolvedValueOnce([[{
         id: 1,
         status: 'UPLOADING',
         file_name: 'test.docx',
         file_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         actor_user_id: 1,
         cancelled_at: null,
         s3_prefix: 'import-media/jobs/1/missing.docx',
       }]]);

       const res = await request(app)
         .post('/api/admin/import/jobs/1/confirm-upload')
         .set('Authorization', `Bearer ${examEditorToken}`)
         .send({
           jobId: 1,
           sha256Hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
         });

       // Should fail because the object is missing from storage.
       expect(res.status).not.toBe(200);
     });
   });

  // -----------------------------------------------------------------------
  // AC6: Transaction rollback on failure
  // -----------------------------------------------------------------------
  describe('AC6: Transaction rollback on failure', () => {
    it('rolls back on finalize failure', async () => {
      setupExamEditorMocks();
      const mockConn = mockConnection();

      mockConn.query.mockResolvedValueOnce([[{
        id: 1,
        title: 'Test Import',
        status: 'INSPECTING',
        file_name: 'test.docx',
        file_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        inspection_result: JSON.stringify({ valid: true, mediaCount: 0, warnings: [], errors: [], media: [], examPreview: null }),
        actor_user_id: 1,
        cancelled_at: null,
      }]]);

      // Fail on exam insert.
      mockConn.query.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app)
        .post('/api/admin/import/jobs/1/finalize')
        .set('Authorization', `Bearer ${examEditorToken}`)
        .send({
          collectionId: 1,
          skillType: 'LR',
          durationMinutes: 60,
        });

      expect(res.status).toBe(500);
      expect(mockConn.rollback).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // AC7: Cancel workflow
  // -----------------------------------------------------------------------
  describe('AC7: Cancel workflow', () => {
    it('cancels job in UPLOADING status', async () => {
      setupExamEditorMocks();
      const mockConn = mockConnection();

      mockConn.query.mockResolvedValueOnce([[{
        id: 1,
        status: 'UPLOADING',
        actor_user_id: 1,
        cancelled_at: null,
      }]]);
      mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockConn.query.mockResolvedValueOnce([{ insertId: 1 }]);

      const res = await request(app)
        .delete('/api/admin/import/jobs/1')
        .set('Authorization', `Bearer ${examEditorToken}`);

      expect(res.status).toBe(200);
      expect(mockConn.commit).toHaveBeenCalled();
    });

    it('cannot cancel READY job', async () => {
      setupExamEditorMocks();
      const mockConn = mockConnection();

      mockConn.query.mockResolvedValueOnce([[{
        id: 1,
        status: 'READY',
        actor_user_id: 1,
        cancelled_at: null,
      }]]);

      const res = await request(app)
        .delete('/api/admin/import/jobs/1')
        .set('Authorization', `Bearer ${examEditorToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Cannot cancel');
    });
  });

  // -----------------------------------------------------------------------
  // Negative: edge cases
  // -----------------------------------------------------------------------
  describe('Negative: edge cases', () => {
    it('rejects file size over 100MB', async () => {
      setupExamEditorMocks();

      const res = await request(app)
        .post('/api/admin/import/jobs')
        .set('Authorization', `Bearer ${examEditorToken}`)
        .send({
          title: 'Test',
          fileName: 'test.docx',
          fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          fileSizeBytes: 101 * 1024 * 1024, // 101MB
        });

      expect(res.status).toBe(400);
    });

    it('rejects invalid file type', async () => {
      setupExamEditorMocks();

      const res = await request(app)
        .post('/api/admin/import/jobs')
        .set('Authorization', `Bearer ${examEditorToken}`)
        .send({
          title: 'Test',
          fileName: 'test.exe',
          fileType: 'application/x-msdownload',
          fileSizeBytes: 1024,
        });

      expect(res.status).toBe(400);
    });

    it('rejects duplicate entries in same job', async () => {
      const { inspectArchive } = await import('../services/docx-import.service');
      // Create ZIP with duplicate entries.
      const entries = [
        { name: 'file.txt', content: 'First' },
        { name: 'file.txt', content: 'Second' },
      ];
      const zipBuffer = createMinimalZipFixture(entries);
      const result = await inspectArchive(zipBuffer, 'application/zip', 'duplicate.zip');

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Duplicate'))).toBe(true);
    });

    it('rejects null byte in entry name', async () => {
      const { inspectArchive } = await import('../services/docx-import.service');
      // Buffer with null byte in name.
      const buffer = Buffer.from('PK\x03\x04file\x00.txt');
      const result = await inspectArchive(buffer, 'application/zip', 'null-byte.zip');

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('null'))).toBe(true);
    });

    it('rejects ZIP bomb', async () => {
      const { inspectArchive } = await import('../services/docx-import.service');
      // Create highly compressible content.
      const content = Buffer.alloc(10 * 1024 * 1024, 0x41);
      const zipBuffer = createMinimalZipFixture([{ name: 'large.txt', content: content.toString('base64') }]);
      const result = await inspectArchive(zipBuffer, 'application/zip', 'bomb.zip');

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('bomb') || e.includes('ratio'))).toBe(true);
    });
  });
});

// Helper: create minimal ZIP fixture for testing.
function createMinimalZipFixture(entries: { name: string; content: string }[]): Buffer {
  // Simple stored (uncompressed) ZIP format.
  const parts: Buffer[] = [];
  const centralDir: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const uncompressed = Buffer.from(entry.content, 'utf8');
    const name = Buffer.from(entry.name, 'utf8');
    const crc = crc32(uncompressed);

    // Local file header.
    const localHeader = Buffer.alloc(30 + name.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(0, 8); // compression (stored)
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0, 12); // mod date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(uncompressed.length, 18);
    localHeader.writeUInt32LE(uncompressed.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    name.copy(localHeader, 30);

    parts.push(localHeader);
    parts.push(uncompressed);

    // Central directory entry.
    const cdEntry = Buffer.alloc(46 + name.length);
    cdEntry.writeUInt32LE(0x02014b50, 0);
    cdEntry.writeUInt16LE(20, 4);
    cdEntry.writeUInt16LE(20, 6);
    cdEntry.writeUInt16LE(0, 8);
    cdEntry.writeUInt16LE(0, 10);
    cdEntry.writeUInt16LE(0, 12);
    cdEntry.writeUInt16LE(0, 14);
    cdEntry.writeUInt32LE(crc, 16);
    cdEntry.writeUInt32LE(uncompressed.length, 20);
    cdEntry.writeUInt32LE(uncompressed.length, 24);
    cdEntry.writeUInt16LE(name.length, 28);
    cdEntry.writeUInt16LE(0, 30);
    cdEntry.writeUInt16LE(0, 32);
    cdEntry.writeUInt16LE(0, 34);
    cdEntry.writeUInt16LE(0, 36);
    cdEntry.writeUInt32LE(localOffset, 40);
    name.copy(cdEntry, 46);

    centralDir.push(cdEntry);
    localOffset += localHeader.length + uncompressed.length;
  }

  const centralDirOffset = localOffset;
  const centralDirBuf = Buffer.concat(centralDir);

  // End of central directory.
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirBuf.length, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...parts, centralDirBuf, eocd]);
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  const table = getCrc32Table();
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

let crc32Table: number[] | null = null;
function getCrc32Table(): number[] {
  if (crc32Table) return crc32Table;
  crc32Table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crc32Table[n] = c >>> 0;
  }
  return crc32Table;
}
