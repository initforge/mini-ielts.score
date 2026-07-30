# Route và flow matrix

Ngày khảo sát: 2026-07-30

## Route tham chiếu đã đi qua

| Route | Trạng thái | Nhánh/hành vi đã kiểm tra |
|---|---|---|
| `/exams?tab=sw` | Đã kiểm tra desktop + mobile | Tab S&W, tìm kiếm, bộ lọc, thẻ đề, nút lịch sử |
| `/exams` | Đã kiểm tra desktop + mobile | Tab L&R, năm/bộ đề, thẻ đề |
| `/exams/:slug` | Đã kiểm tra | Màn chuẩn bị L&R, modal thi thật/luyện tập |
| `/speaking-writing/Test1` | Đã kiểm tra | Kiểm tra micro, intro, directions, nhiều dạng Speaking |
| `/writing/Test1` | Đã kiểm tra | Directions, viết theo ảnh, email, essay |
| `/ai-processing?type=sw` | Đã kiểm tra | Tiến trình chấm AI; anonymous flow lỗi Unauthorized ở 5% |
| `/history` | Đã kiểm tra anonymous | Redirect tới `/auth` |
| `/auth` | Đã kiểm tra | Auth gate |

## Cây hành vi

```text
Danh sách đề
├── chuyển tab S&W / L&R
├── tìm kiếm và lọc
├── mở lịch sử
│   └── anonymous → auth
└── chọn đề
    ├── thi thật
    └── luyện tập
        ├── L&R
        │   ├── Listening Part 1–4
        │   ├── bảng câu hỏi / đánh dấu review
        │   ├── chuyển thẳng sang Reading
        │   ├── Reading Part 5–7
        │   ├── song ngữ / annotation tools
        │   └── nộp bài
        │       ├── chứng chỉ kết quả
        │       ├── bảng điểm
        │       ├── bản đồ lỗi
        │       └── review từng câu
        └── S&W
            ├── kiểm tra micro
            ├── Speaking Part 1–5
            ├── Writing Part 1–3
            ├── native submit confirmation
            └── AI processing
                └── anonymous → Unauthorized
```

## Ma trận trạng thái cần có ở sản phẩm Anish

| Khu vực | Trạng thái tối thiểu cần thiết kế/kiểm thử |
|---|---|
| Danh sách | loading, empty, error, search no-result, lọc, phân trang hoặc load-more |
| Auth | chưa đăng nhập, hết phiên, không đủ quyền, quay lại đúng đề sau login |
| Attempt | chưa bắt đầu, đang làm, pause/visibility change, hết giờ, resume, đã nộp |
| Micro/audio | chưa cấp quyền, từ chối, không có thiết bị, ghi âm rỗng, codec không hỗ trợ |
| Media | loading, 404, chậm, retry, signed URL hết hạn |
| Submit | thiếu câu, đang upload audio, double-submit, offline, server timeout |
| AI grading | queued, processing, partial, success, failed, retry, quota exceeded |
| Result | provisional, final, review payload, download/share permission |
| Mobile | sticky controls, safe area, keyboard mở khi viết, landscape, audio controls |

## Khoảng trống của lượt khảo sát

- `/thi-thu` hiện tại của Anish bị auth gate trong phiên khảo sát công khai; chưa có bằng chứng màn bên trong khi đã đăng nhập.
- Chưa kiểm tra tài khoản có dữ liệu lịch sử thật, quyền giáo viên/admin, thanh toán hoặc entitlement Pro.
- Không tải file kết quả từ nút download vì đây không phải điều kiện cần để xác định kiến trúc luồng.
