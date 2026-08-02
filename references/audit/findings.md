# Audit findings

Ngày khảo sát: 2026-07-30

Đây là audit trước khi chốt phạm vi, chưa phải kế hoạch triển khai.

## Kết luận kiến trúc

Không nên lấy HTML tải bằng Ctrl+S làm nền production. Có thể lưu HTML/screenshot làm reference, nhưng phần chạy thật cần được dựng lại bằng component, route và API contract của Anish. Bản tham chiếu gắn chặt với Supabase, signed media URL, edge function và trạng thái auth riêng; sao chép DOM/JS sẽ kéo theo lỗi, phụ thuộc và rủi ro bản quyền nội dung.

Prototype hiện tại hữu ích như nguồn tham khảo cho timer, recorder, rubric và một số UI thi S&W. Nó chưa phải drop-in module cho monorepo Anish.

## Phát hiện ưu tiên cao

### F-01 — Stack thực tế lệch stack đích

- Repo hiện tại: Vite 5, Tailwind 3, một SPA không có React Router/TanStack Query/Zustand.
- Dev proxy gọi API ở cổng `4000`; Express production mặc định `3000`.
- Stack Anish được mô tả dùng Vite/Tailwind 4, Router v6, service layer, Express `7000`.
- Hệ quả: không nên nâng prototype thành app độc lập rồi “merge sau”; cần đóng gói theo boundary module/route/API của Anish ngay từ đầu.

### F-02 — API key của người dùng nằm ở browser

- UI lưu raw Gemini key trong `localStorage`.
- `App.tsx` gửi key trong body của request chấm điểm.
- Hai handler chấm Speaking/Writing từ chối request nếu body không có `apiKey`, dù thư viện Gemini có nhánh đọc biến môi trường.
- Hệ quả: contract hiện tại không đạt mục tiêu “điền env là chạy” và làm tăng rủi ro lộ key.
- Khuyến nghị: key thuộc server, chỉ nằm trong secret/env; browser chỉ gửi attempt data tới API đã auth.

### F-03 — Log có thể làm lộ secret và dữ liệu giọng nói

- Server log prefix/độ dài API key.
- Speaking handler và Gemini helper log sample base64 đầu/cuối, transcript và nội dung model response.
- Hệ quả: secret và dữ liệu cá nhân có thể lọt vào log aggregation.
- Khuyến nghị: structured logging có redaction; không log key, base64, transcript đầy đủ hoặc model response.

### F-04 — Chưa có auth, persistence và lịch sử

- Prototype không có user/session/attempt/result persistence.
- Trạng thái câu trả lời chủ yếu ở React context, session storage và IndexedDB.
- Không có contract MySQL cho exam, question, attempt, response, media, grading job, result.
- Hệ quả: refresh, đổi thiết bị, retry grading, lịch sử và phân quyền chưa có nền dữ liệu đáng tin cậy.

### F-05 — Anonymous S&W của trang tham chiếu đi được quá sâu rồi mới lỗi

- Anonymous user có thể bắt đầu bài, kiểm tra micro, làm Speaking/Writing và submit.
- `/ai-processing?type=sw` dừng ở 5% với `evaluate-writing-part15: Unauthorized`.
- Một số edge function dịch/lookup/TTS cũng trả `401`.
- Hệ quả: người dùng mất thời gian làm bài rồi mới biết không thể nhận kết quả.
- Khuyến nghị: kiểm tra auth/entitlement trước khi tạo attempt; nếu có demo anonymous thì dùng contract riêng và nói rõ giới hạn.

### F-06 — Payload công khai của reference chứa nội dung review

- Network audit anonymous thấy question payload có hint, sample answer, bản dịch và dữ kiện review.
- Hệ quả: có thể lộ đáp án/nội dung hướng dẫn ngay trong lúc thi.
- Khuyến nghị: tách `exam payload` khỏi `review payload`; chỉ trả explanation/sample sau khi attempt đã submit và qua kiểm tra quyền.

### F-07 — Media contract không ổn định

- Reference có object Speaking image bị storage trả `NoSuchKey`.
- Prototype gọi `/audio/...mp3` nhưng Vite fallback trả `200 text/html`; audio element sau đó báo không hỗ trợ nguồn.
- `.gitignore` loại toàn bộ `public/audio/`, nên clone sạch không có media để chạy đầy đủ.
- Hệ quả: HTTP 200 không đồng nghĩa media hợp lệ; trải nghiệm thi có thể hỏng giữa chừng.
- Khuyến nghị: manifest media, content-type validation, health check và fallback UI; asset production nằm trên S3/Cloudinary/CDN.

### F-08 — Cloudflare chưa có contract triển khai

- Repo hiện có cấu hình Vercel/VPS/nginx, chưa có Pages/Workers/Wrangler config.
- `env.production.example` không mô tả Cloudflare hoặc public API origin.
- Express theo kiểu listen cổng không thể mặc định coi là Worker runtime.
- Khuyến nghị sơ bộ: nếu Anish backend Express vẫn ở `:7000`, Cloudflare chỉ host/proxy frontend/CDN và inject public API origin; secret Gemini nằm ở backend. Chỉ chọn Workers khi chủ động chuyển adapter/runtime.

## Phát hiện chất lượng và UX

### F-09 — Baseline install/lint chưa sạch

- `npm ci` thất bại vì `package-lock.json` không đồng bộ với `package.json`.
- `npm run lint` thất bại vì không có ESLint configuration.
- `npm run build` chạy được sau diagnostic install không cập nhật lockfile.

### F-10 — App shell khó tích hợp

- `src/App.tsx` là component điều phối lớn, trộn chọn bài, submit, gọi API và result.
- Không có route-level lazy loading hoặc module boundary phù hợp `pages/user` của Anish.
- Build cảnh báo một số module vừa static vừa dynamic import nên không tách chunk.

### F-11 — UX reference có hành động phá vỡ kỳ vọng

- L&R `Nộp bài` chuyển thẳng sang kết quả dù bài chưa hoàn thành, không có confirm.
- Chuyển Listening → Reading diễn ra ngay, không có confirm.
- Mobile L&R ẩn timer, số câu và volume ở header; đáp án nằm dưới fold.
- Dialog thiếu accessible title; một số form control thiếu id/name.

### F-12 — Nội dung prototype lẫn nhãn giữa Speaking/Writing

- Selector Speaking vẫn hiển thị các nhãn “Write sentences”, “Email response”, “Opinion essay”.
- Sau khi bắt đầu, user phải tự chọn câu đầu tiên thay vì được đưa vào flow rõ ràng.

### F-13 — Nên mượn information architecture, không mượn visual skin

- Anish hiện dùng nền navy rất tối, card đậm, accent cyan/blue và CTA cam; mật độ thông tin thiên về dashboard học tập.
- XoaMu dùng nền sáng, grid card trắng và một rail quảng bá bên phải.
- Prototype dùng một canvas trắng rất lớn, ít thông tin và nút kết nối Gemini nổi bật hơn nhiệm vụ chính.
- Hướng phù hợp: giữ cấu trúc khám phá đề/tabs/filter của reference nhưng dùng token, navbar, card, badge và CTA của Anish; bỏ rail quảng bá, bỏ nút nhập Gemini key và ưu tiên trạng thái attempt gần nhất.

## Quyết định cần chốt trước khi lập full plan

1. V1 chỉ làm S&W như URL tham chiếu/repo hiện tại, hay làm cả L&R + S&W?
2. `/thi-thu` bắt buộc đăng nhập trước khi xem/chọn đề, hay cho xem danh sách công khai và chỉ chặn lúc bắt đầu?
3. “Cloudflare” là Pages/CDN đứng trước frontend + Express Anish hiện hữu, hay yêu cầu backend chạy trên Workers?
4. Có dùng dữ liệu đề thật do Anish cung cấp hay chỉ seed một bộ demo tự tạo? Không nên sao chép nội dung độc quyền từ site tham chiếu.

---

# S7 bổ sung — findings slice-review F-11..F-16 (nguồn: ledger) + F-RECON-20260731

> Phần dưới được append tại S7 handoff. LƯU Ý: F-01..F-13 phía trên là audit
> trước-khi-lập-plan (namespace cũ, tiếng Việt). F-11..F-16 dưới đây là findings
> slice-review S4–S6 ghi trong `ledger.json` — trùng số ID với namespace cũ, nội dung
> khác. Tra cứu theo `slice_id` chứ không theo số F.

## F-11 — S4-FE: thiếu screenshot riêng cho Part 3/4/6

- Nguồn: `agent-rules-reviewer:S4-FE` (ledger, severity low).
- Nội dung: Part 3/4/6 chỉ có assertion "đã trả lời", chưa có screenshot riêng; visual
  parity chưa được chứng minh tường minh.
- Ledger resolution: Non-blocking (low); claim được independent reviewer PASS.
- F-RECON-20260731: CLOSED — S7 journey đầy đủ chụp catalog/part1/palette/submit/result/
  errormap/review/history cho cả desktop + mobile; S4-FE evidence giữ assertion từng câu.

## F-12 — S5-FE: benign race 409 autosave trước submit

- Nguồn: `agent-rules-reviewer:S5-FE` (ledger, severity low).
- Nội dung: PATCH writing autosave có thể bắn sau submit → 409, reconciled không mất dữ
  liệu; submit không cancel timer autosave (swStore.ts:494-505).
- Ledger resolution: Non-blocking (low); independent reviewer PASS.
- F-RECON-20260731: CLOSED — S7 SW journeys (desktop+mobile) submit sạch, không có 409
  chưa xử lý trong console-network.txt.

## F-13 — S4-FE: console noise (React Router v7 future-flag + antd Spin tip)

- Nguồn: `agent-rules-reviewer:S4-FE` (ledger, severity low).
- Nội dung: warning cosmetic từ React Router + antd Spin.
- Ledger resolution: Non-blocking (low); independent reviewer PASS.
- F-RECON-20260731: CLOSED — console-network.txt S7 chỉ còn noise dev thông thường, không
  pageerror.

## F-14 — Repo hygiene: file debug + scratch

- Nguồn: `agent-rules-reviewer:S5-FE` (ledger, severity low).
- Nội dung: file debug `anish-toeic-web-app/s4fe-debug4.mjs` chưa tracked; `scratch/` và
  `scripts/integration/` chưa tracked; cần gỡ artifact debug trước merge.
- Ledger resolution: Non-blocking (low); independent reviewer PASS.
- F-RECON-20260731: CLOSED với hướng dẫn — `s4fe-debug4.mjs` KHÔNG commit (xóa);
  `scratch/xoamutoeic/` KHÔNG commit; `scripts/integration/` GIỮ (dev infra docker-compose,
  runbook dùng). Xem `docs/06-merge-handoff.md` §3.

## F-15 — Full test suite cần DB_NAME=anish_toeic_test

- Nguồn: `agent-rules-reviewer:S6-BE` (ledger, severity low).
- Nội dung: 134/134 chỉ PASS khi chạy với DB test; RUN A trên DB live có 2 lỗi
  env-sensitive (migrations.test, server.test) — không phải lỗi code S6-BE.
- Ledger resolution: Non-blocking (low); independent reviewer PASS.
- F-RECON-20260731: CLOSED — runbook ghi rõ `DB_NAME=anish_toeic_test npm test`
  (`docs/05-runbook.md` §7). S7 chạy typecheck+lint cả hai workspace exit 0.

## F-16 — ecosystem.config.cjs: env rỗng

- Nguồn: `agent-rules-reviewer:S6-BE` (ledger, severity low).
- Nội dung: giá trị env URL/TOKEN/DB/JWT trong ecosystem rỗng — config-only, fill lúc
  deploy; không chứa secret.
- Ledger resolution: Non-blocking (low); independent reviewer PASS.
- F-RECON-20260731: CLOSED — validator PM2 xác nhận lại: không secret material; empty =
  deploy-time fill (`.agent/evidence/S7/infra-20260731/pm2.txt`).

## F-RECON-20260731 — trạng thái reconciliation

- Thực hiện: S7 handoff, đối chiếu từng finding với state repo đã verify.
- Kết quả: F-11..F-16 đều CLOSED (không còn finding mở).
- Mục ngoài scope vẫn UNAVAILABLE (không live proof): Cloudflare AI Worker, S3 presign,
  Cloudflare edge live config — xem `docs/06-merge-handoff.md` §5.
- Nguồn dữ liệu: `ledger.json` (source of truth, read-only), evidence `.agent/evidence/S7/*`.
