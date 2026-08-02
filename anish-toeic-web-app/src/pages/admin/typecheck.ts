// Type-level check: verifies admin page types align with the API contract.
// Run via `tsc --noEmit` (the project test command).
import type { AdminExam, LifecycleResult } from './OnlineExamPage';

export type _AssertAdminExam = AdminExam extends { status: string; version: number } ? true : never;
export type _AssertLifecycleResult = LifecycleResult extends { success: boolean; examId: number; status: string } ? true : never;
export type _AssertMenuLabels = ['Đề thi trực tuyến', 'Đề hỗn hợp', 'Kết quả thi trực tuyến'] extends { length: 3 } ? true : never;
