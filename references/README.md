# Reference index — thi thử TOEIC

Ngày khảo sát: 2026-07-30

Thư mục này chỉ chứa bằng chứng khảo sát và tài liệu đối chiếu. Các HTML snapshot là ảnh chụp DOM phục vụ review, không phải mã nguồn để đưa vào production.

## Phạm vi bằng chứng

- `xoamutoeic/`: 31 ảnh desktop, 4 ảnh mobile, accessibility snapshot và một số DOM snapshot của luồng tham chiếu.
- `anishtoeic/`: trang chủ desktop/mobile và auth gate hiện tại của `/thi-thu`.
- `local-prototype/`: giao diện repo hiện tại, console/network và bằng chứng lỗi audio.
- `audit/`: route-flow matrix, phát hiện kỹ thuật và baseline Git/repository.

Tổng cộng tại thời điểm lập chỉ mục:

- 44 ảnh PNG.
- 46 accessibility/DOM snapshot dạng Markdown.
- 4 HTML snapshot.

## Ảnh chính để review nhanh

### XoaMu TOEIC

- Danh sách S&W: `xoamutoeic/screenshots/desktop/01-exams-sw-list-full.png`
- Danh sách L&R: `xoamutoeic/screenshots/desktop/02-exams-lr-list-full.png`
- Modal chọn chế độ: `xoamutoeic/screenshots/desktop/03-exam-start-mode-modal.png`
- Bài L&R đang làm: `xoamutoeic/screenshots/desktop/07-exam-lr-part1-question1.png`
- Bảng câu hỏi: `xoamutoeic/screenshots/desktop/08-exam-lr-question-palette.png`
- Công cụ ghi chú: `xoamutoeic/screenshots/desktop/11-exam-lr-annotation-tools.png`
- Kết quả: `xoamutoeic/screenshots/desktop/15-exam-lr-result-certificate.png`
- Bản đồ lỗi: `xoamutoeic/screenshots/desktop/17-exam-lr-error-map.png`
- Review chi tiết: `xoamutoeic/screenshots/desktop/18-exam-lr-review-detail.png`
- Speaking: `xoamutoeic/screenshots/desktop/23-exam-sw-speaking-q1-preparation.png`
- Writing: `xoamutoeic/screenshots/desktop/28-exam-sw-writing-q1-picture.png`
- AI processing thất bại: `xoamutoeic/screenshots/desktop/31-exam-sw-ai-processing.png`
- Mobile L&R: `xoamutoeic/screenshots/mobile/03-exam-lr-q1.png`
- Mobile Writing: `xoamutoeic/screenshots/mobile/04-exam-sw-writing-q1.png`

### Anish TOEIC

- Trang chủ desktop: `anishtoeic/screenshots/desktop/02-homepage-full.png`
- `/thi-thu` desktop khi chưa đăng nhập: `anishtoeic/screenshots/desktop/01-thi-thu-auth-gate.png`
- Trang chủ mobile: `anishtoeic/screenshots/mobile/01-homepage-full.png`
- `/thi-thu` mobile khi chưa đăng nhập: `anishtoeic/screenshots/mobile/02-thi-thu-auth-gate.png`

### Prototype hiện tại

- Trang chọn kỹ năng: `local-prototype/screenshots/01-home-selector.png`
- Chọn Speaking: `local-prototype/screenshots/02-speaking-selector.png`
- Speaking câu 1: `local-prototype/screenshots/04-speaking-q1.png`
- Chọn Writing: `local-prototype/screenshots/05-writing-selector.png`
- Bằng chứng audio trả HTML thay vì audio: `local-prototype/snapshots/audio-part1-response-headers.txt`

## Lưu ý tên file

- `xoamutoeic/screenshots/desktop/14-exam-lr-submit-confirm.png` được đặt tên lúc khảo sát nhưng thao tác thực tế chuyển thẳng sang kết quả, không có confirm.
- `xoamutoeic/snapshots/exam-skip-to-reading-confirm.md` cũng là tên tạm; thao tác thực tế nhảy ngay tới câu Reading.
