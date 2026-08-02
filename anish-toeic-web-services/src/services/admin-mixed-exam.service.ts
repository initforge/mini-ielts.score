import { pool } from './db.service';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { HttpError, notFound, forbidden, conflict } from '../errors/http.error';

// Source for mixed exam query.
interface MixedSourceRow extends RowDataPacket {
  id: number;
  source_exam_id: number;
  source_version: number;
  order_index: number;
  section_mapping: string | null;
  source_title: string;
  source_slug: string;
}

export interface MixedExamSource {
  sourceExamId: number;
  sourceVersion: number;
  orderIndex: number;
  sectionMapping?: Record<string, unknown>;
}

export interface CreateMixedExamInput {
  title: string;
  slug: string;
  collectionId: number;
  skillType: string;
  durationMinutes: number;
  sources: MixedExamSource[];
}

/** Validate that all source exams are PUBLISHED and versions are immutable. */
async function validateSources(sources: MixedExamSource[]): Promise<void> {
  // ponytail: deduplicate BEFORE DB query so duplicate check is authoritative.
  const seenIds = new Set<number>();
  for (const src of sources) {
    if (seenIds.has(src.sourceExamId)) {
      throw conflict(`Duplicate source exam: ${src.sourceExamId}`);
    }
    seenIds.add(src.sourceExamId);
  }

  const sourceIds = sources.map(s => s.sourceExamId);
  if (sourceIds.length === 0) {
    throw new HttpError(400, 'Mixed exam must have at least one source');
  }

  const [examRows] = await pool.query<RowDataPacket[]>(
    `SELECT id, status, published_version, title FROM toeic_exams WHERE id IN (?)`,
    [sourceIds]
  );

  if (examRows.length !== sourceIds.length) {
    throw notFound('One or more source exams not found');
  }

  for (const src of sources) {
    const exam = examRows.find(r => r.id === src.sourceExamId);
    if (!exam) continue; // Already handled above

    if (exam.status !== 'PUBLISHED') {
      throw forbidden(`Source exam ${src.sourceExamId} (${exam.title}) is not PUBLISHED`);
    }

    // Verify the specified version exists and is immutable.
    if (src.sourceVersion !== exam.published_version) {
      throw conflict(`Source exam ${src.sourceExamId} version ${src.sourceVersion} is not the current published version (${exam.published_version})`);
    }
  }
}

export class AdminMixedExamService {
  /** Create a new mixed exam with sources. Sources must be PUBLISHED. */
  static async createMixedExam(
    input: CreateMixedExamInput,
    actorUserId: string
  ): Promise<{ examId: number; version: number }> {
    await validateSources(input.sources);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Create the mixed exam in DRAFT status.
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO toeic_exams
         (collection_id, slug, title, duration_minutes, question_count, skill_type, status, version, is_mixed)
         VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', 1, TRUE)`,
        [input.collectionId, input.slug, input.title, input.durationMinutes, 0, input.skillType]
      );

      const examId = result.insertId;

      // Insert sources with deterministic ordering.
      for (const src of input.sources.sort((a, b) => a.orderIndex - b.orderIndex)) {
        await connection.query(
          `INSERT INTO mixed_exam_sources
           (mixed_exam_id, source_exam_id, source_version, order_index, section_mapping)
           VALUES (?, ?, ?, ?, ?)`,
          [
            examId,
            src.sourceExamId,
            src.sourceVersion,
            src.orderIndex,
            src.sectionMapping ? JSON.stringify(src.sectionMapping) : null,
          ]
        );
      }

      // Audit log.
      await connection.query(
        `INSERT INTO mixed_exam_audit_log
         (mixed_exam_id, action, actor_user_id, new_sources, details)
         VALUES (?, ?, ?, ?, ?)`,
        [
          examId,
          'CREATE',
          actorUserId,
          JSON.stringify(input.sources),
          JSON.stringify({ skillType: input.skillType }),
        ]
      );

      await connection.commit();
      return { examId, version: 1 };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /** Update sources for a DRAFT mixed exam. Must be DRAFT. */
  static async updateSources(
    examId: number,
    sources: MixedExamSource[],
    actorUserId: string
  ): Promise<void> {
    // Validate first - no changes until all sources are valid.
    await validateSources(sources);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Lock and verify exam is DRAFT.
      const [examRows] = await connection.query<RowDataPacket[]>(
        'SELECT id, status, is_mixed FROM toeic_exams WHERE id = ? FOR UPDATE',
        [examId]
      );
      if (!examRows.length) {
        await connection.rollback();
        throw notFound('Mixed exam not found');
      }
      if (!examRows[0].is_mixed) {
        await connection.rollback();
        throw forbidden('Exam is not a mixed exam');
      }
      if (examRows[0].status !== 'DRAFT') {
        await connection.rollback();
        throw conflict('Only DRAFT mixed exams can have sources updated');
      }

      // Capture previous sources for audit.
      const [prevRows] = await connection.query<RowDataPacket[]>(
        'SELECT source_exam_id, source_version, order_index FROM mixed_exam_sources WHERE mixed_exam_id = ?',
        [examId]
      );

      // Delete old sources.
      await connection.query('DELETE FROM mixed_exam_sources WHERE mixed_exam_id = ?', [examId]);

      // Insert new sources.
      for (const src of sources.sort((a, b) => a.orderIndex - b.orderIndex)) {
        await connection.query(
          `INSERT INTO mixed_exam_sources
           (mixed_exam_id, source_exam_id, source_version, order_index, section_mapping)
           VALUES (?, ?, ?, ?, ?)`,
          [
            examId,
            src.sourceExamId,
            src.sourceVersion,
            src.orderIndex,
            src.sectionMapping ? JSON.stringify(src.sectionMapping) : null,
          ]
        );
      }

      // Audit log.
      await connection.query(
        `INSERT INTO mixed_exam_audit_log
         (mixed_exam_id, action, actor_user_id, previous_sources, new_sources, details)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          examId,
          'UPDATE_SOURCES',
          actorUserId,
          JSON.stringify(prevRows),
          JSON.stringify(sources),
          null,
        ]
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /** Publish a mixed exam. Creates immutable snapshot from source content. */
  static async publishMixedExam(examId: number, actorUserId: string): Promise<{ version: number }> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [examRows] = await connection.query<RowDataPacket[]>(
        'SELECT id, status, version, is_mixed FROM toeic_exams WHERE id = ? FOR UPDATE',
        [examId]
      );
      if (!examRows.length) {
        await connection.rollback();
        throw notFound('Mixed exam not found');
      }
      if (!examRows[0].is_mixed) {
        await connection.rollback();
        throw forbidden('Exam is not a mixed exam');
      }
      if (examRows[0].status === 'PUBLISHED') {
        await connection.rollback();
        throw conflict('Mixed exam is already PUBLISHED');
      }
      if (examRows[0].status === 'ARCHIVED') {
        await connection.rollback();
        throw conflict('Cannot publish an ARCHIVED mixed exam');
      }

      // Get sources (already validated at creation/update).
      const [sourceRows] = await connection.query<MixedSourceRow[]>(
        `SELECT mes.*, e.title as source_title, e.slug as source_slug
         FROM mixed_exam_sources mes
         JOIN toeic_exams e ON mes.source_exam_id = e.id
         WHERE mes.mixed_exam_id = ?
         ORDER BY mes.order_index`,
        [examId]
      );

      if (!sourceRows.length) {
        await connection.rollback();
        throw new HttpError(400, 'Mixed exam has no sources');
      }

      // Build composite snapshot from sources in deterministic order.
      const sections: Record<string, unknown>[] = [];
      let totalQuestionCount = 0;

      for (const src of sourceRows) {
        const [snapshotRows] = await connection.query<RowDataPacket[]>(
          'SELECT snapshot FROM exam_snapshots WHERE exam_id = ? AND version = ? LIMIT 1',
          [src.source_exam_id, src.source_version]
        );
        if (!snapshotRows.length) {
          await connection.rollback();
          throw notFound(`Snapshot not found for source exam ${src.source_exam_id} version ${src.source_version}`);
        }

        const snapshot = typeof snapshotRows[0].snapshot === 'string'
          ? JSON.parse(snapshotRows[0].snapshot)
          : snapshotRows[0].snapshot;

        // Apply section mapping if present.
        const sectionMapping = src.section_mapping
          ? (typeof src.section_mapping === 'string' ? JSON.parse(src.section_mapping) : src.section_mapping)
          : null;

        if (sectionMapping && sectionMapping.includeSections) {
          const includeIds = new Set(sectionMapping.includeSections as number[]);
          sections.push(
            ...(snapshot.sections as Record<string, unknown>[]).filter((s: Record<string, unknown>) =>
              includeIds.has(s.id as number)
            )
          );
        } else {
          sections.push(...(snapshot.sections as Record<string, unknown>[]));
        }
        totalQuestionCount += snapshot.questionCount || 0;
      }

      const exam = examRows[0];
      const newVersion = (exam.version as number) + 1;

      const mixedSnapshot = {
        examId,
        isMixed: true,
        version: newVersion,
        title: null, // Will be populated from exam metadata
        sections,
        sourceCount: sourceRows.length,
        totalQuestionCount,
      };

      // Insert immutable snapshot.
      await connection.query(
        'INSERT INTO exam_snapshots (exam_id, version, snapshot) VALUES (?, ?, ?)',
        [examId, newVersion, JSON.stringify(mixedSnapshot)]
      );

      // Update exam.
      await connection.query(
        'UPDATE toeic_exams SET status = ?, version = ?, published_version = ?, question_count = ? WHERE id = ?',
        ['PUBLISHED', newVersion, newVersion, totalQuestionCount, examId]
      );

      // Audit.
      await connection.query(
        `INSERT INTO mixed_exam_audit_log
         (mixed_exam_id, action, actor_user_id, new_sources, details)
         VALUES (?, ?, ?, ?, ?)`,
        [
          examId,
          'PUBLISH',
          actorUserId,
          JSON.stringify(sourceRows.map(s => ({
            sourceExamId: s.source_exam_id,
            sourceVersion: s.source_version,
            orderIndex: s.order_index,
          }))),
          JSON.stringify({ version: newVersion }),
        ]
      );

      await connection.commit();
      return { version: newVersion };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /** Get mixed exam with its sources. */
  static async getMixedExam(examId: number) {
    const [examRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, collection_id, slug, title, status, version, published_version, is_mixed
       FROM toeic_exams WHERE id = ?`,
      [examId]
    );
    if (!examRows.length) return null;

    const [sourceRows] = await pool.query<MixedSourceRow[]>(
      `SELECT mes.*, e.title as source_title, e.slug as source_slug, e.status as source_status
       FROM mixed_exam_sources mes
       JOIN toeic_exams e ON mes.source_exam_id = e.id
       WHERE mes.mixed_exam_id = ?
       ORDER BY mes.order_index`,
      [examId]
    );

    return {
      ...examRows[0],
      sources: sourceRows.map(s => ({
        sourceExamId: s.source_exam_id,
        sourceVersion: s.source_version,
        orderIndex: s.order_index,
        sourceTitle: s.source_title,
        sourceSlug: s.source_slug,
        sourceStatus: s.source_status,
      })),
    };
  }
}
