# Repository baseline

Ngày ghi nhận: 2026-07-30

## Git safety checkpoint

- Remote: `https://github.com/initforge/mini-toeic.score`
- Remote default branch: `master`
- Commit gốc: `76061827bf2e3ffd60133b9982782f8bb45429a3`
- Backup remote đã tạo: `backup/pre-mini-toeic-2026-07-30`
- `master` và backup cùng trỏ tới đúng commit gốc.
- Local working branch: `feat/thi-thu-redesign`
- Không sửa hoặc force-push remote `master`.
- Chưa commit/push source triển khai.

## Verification baseline

| Check | Kết quả | Bằng chứng |
|---|---|---|
| Remote backup | PASS | Hai ref remote cùng SHA `76061827…` |
| `npm ci` | FAIL | Lockfile không đồng bộ với package manifest |
| Diagnostic install | PASS | `npm install --package-lock=false --ignore-scripts` |
| `npm run build` | PASS | Vite build thành công; có chunking warnings |
| `npm run lint` | FAIL | Không tìm thấy ESLint configuration |
| Local UI smoke | PARTIAL | UI mở được; audio path trả SPA HTML fallback |

Diagnostic install chỉ tạo `node_modules` bị git ignore, không cập nhật `package-lock.json`.
