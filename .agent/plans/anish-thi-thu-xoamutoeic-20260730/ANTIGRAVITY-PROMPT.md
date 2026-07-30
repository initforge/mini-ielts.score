# Prompt to paste into Antigravity

Bạn là main coordinator của Antigravity cho repo
`P:\mini-toeic.score`. Hãy thực thi tự động đến khi hoàn tất gói công việc
`anish-thi-thu-xoamutoeic-20260730` theo harness hiện tại.

## Nguồn bắt buộc phải đọc trước khi sửa

1. `.agent/plans/anish-thi-thu-xoamutoeic-20260730/plan.md`
2. `.agent/plans/anish-thi-thu-xoamutoeic-20260730/source-coverage.md`
3. `.agent/plans/anish-thi-thu-xoamutoeic-20260730/context-capsules.md`
4. `.agent/work/anish-thi-thu-xoamutoeic-20260730/ledger.json`
5. `references/README.md`
6. `references/audit/route-flow-matrix.md`
7. `references/audit/findings.md`

Plan Markdown là intent contract; ledger workctl là execution state. Không tự
đổi scope, không dùng prototype cũ làm kiến trúc, không hỏi lại những quyết
định đã khóa.

## Khởi động đúng harness

1. `git fetch origin` và xác nhận checkout bắt đầu từ remote primary
   `origin/master`.
2. Tạo branch `feat/thi-thu-full-xoamutoeic`; không code trực tiếp trên
   `master`, không force-push.
3. Dùng workctl đã cài tại
   `%USERPROFILE%\.gemini\config\agent-rules-tools\workctl.ps1`:

   ```powershell
   & "$env:USERPROFILE\.gemini\config\agent-rules-tools\workctl.ps1" `
     --root "P:\mini-toeic.score" status `
     --work-id "anish-thi-thu-xoamutoeic-20260730"
   ```

4. Gọi custom agents bằng Antigravity native `invoke_subagent`:
   - `agent-rules-implementer` cho từng slice thực thi.
   - `agent-rules-reviewer` cho review độc lập.
   - `agent-rules-verifier` cho bằng chứng tích hợp cuối.
   - `agent-rules-researcher` chỉ cho discovery read-only có phạm vi hẹp.
5. Mỗi agent phải trả acknowledgment rõ ràng trước khi coordinator gọi
   `workctl ack-assignment` và `workctl start`.
6. Dùng `model: inherit`, effort tối thiểu medium. Không chọn Gemini 3.6 Flash
   bị policy deny. Nếu host không cung cấp telemetry model, ghi `unobserved`;
   không bịa `observed`.
7. Tối đa 4 agent đang hoạt động tính cả main, delegation depth tối đa 1.
   Không có hai writer sở hữu cùng path.

## Thứ tự bắt buộc

- S0 và S1 có thể chạy song song.
- **S0 là hard gate cho mọi frontend parity slice.** S0 phải dùng Chrome
  `Ctrl+S -> Webpage, Complete`, lưu HTML + `_files`, manifest/hash và mở
  offline thành công. Screenshot hoặc `outerHTML` không được tính là đạt.
- Sau S1: chạy S2.
- Sau S0/S1/S2: chạy S3; S4 và S5 có thể song song.
- Sau S2/S4/S5: chạy S6.
- Sau S3–S6: chạy S7.

Khi gọi worker, gửi đúng capsule của slice, source IDs, write paths, forbidden
paths và ACs. Không dump toàn bộ transcript.

## Quy tắc thực thi

- Bám XoaMu về toàn bộ bố cục, spacing, responsive, interaction và flow của
  `/thi-thu`; chỉ thay màu/branding sang Anish và dùng shared Anish shell.
- Làm đầy đủ L&R + S&W nhưng production seed rỗng; chỉ synthetic fixture cho
  dev/test.
- Public được xem catalog; phải login trước khi tạo attempt.
- Kiến trúc đích bắt buộc là hai app Vite `5173` và Express `7000`, `/api`
  proxy, MySQL, Redis, S3/Cloudinary và Gemini server-side.
- Không đưa Gemini key vào browser, không log token/base64/transcript, không
  trả review content trong exam-session payload.
- Không copy XoaMu bundle minified hoặc dữ liệu đề vào production source.
- Không deploy production. Được edit/test/commit và push feature branch.
- Sau mỗi slice: chạy proof đúng AC, reviewer độc lập, sửa finding, ghi
  workctl receipt/checkpoint, commit nhỏ có ý nghĩa và push checkpoint.
- Build chỉ chứng minh build; UI cần browser desktop/mobile, console/network
  sạch và visual comparison với production reference.
- Tiếp tục tự động qua các slice dependency-ready, không dừng để bắt owner
  relay phase.

## Điều kiện kết thúc

- Chỉ báo `PASS` khi tất cả required slices/AC đã pass bằng bằng chứng mới,
  mọi independent review đạt và không còn finding mở.
- Báo `PARTIAL` nếu còn external prerequisite không thuộc quyền xử lý nhưng
  phần hoàn tất có bằng chứng.
- Báo `BLOCKED` chỉ khi cần credential/permission/quyết định thực sự.
- Final phải liệt kê branch/commit đã push, test/build/browser evidence,
  unresolved risk và trạng thái workctl. Không tuyên bố deploy.
