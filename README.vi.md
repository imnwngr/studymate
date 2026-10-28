<h1 align="center">studymate</h1>
<p align="center"><strong>Xem bài. Áp dụng dựa trên bằng chứng.</strong></p>
<p align="center">Tiện ích Chrome cho NGL / Spark và bài tập QTI tương thích.</p>
<p align="center">
  <img src="https://img.shields.io/badge/version-0.8.0-555555?style=flat-square" alt="Phiên bản 0.8.0">
  <img src="https://img.shields.io/badge/browser-Chrome-555555?style=flat-square" alt="Trình duyệt: Chrome">
  <img src="https://img.shields.io/badge/extension-Manifest_V3-555555?style=flat-square" alt="Tiện ích: Manifest V3">
</p>
<p align="center"><a href="README.md">English</a> · <strong>Tiếng Việt</strong></p>
<p align="center">
  <a href="#quick-start">Bắt đầu</a> · <a href="#features">Tính năng</a> ·
  <a href="#inspector">Inspector</a> · <a href="#privacy">Riêng tư</a> ·
  <a href="#development">Phát triển</a> · <a href="#limitations">Giới hạn</a>
</p>

---

studymate đọc bài được hỗ trợ, lấy ánh xạ đáp án hiện có và áp dụng kết quả đủ điều kiện bằng điều khiển của website. Kiểm tra bài đã nhận diện và trạng thái trang thực tế trước khi nộp.

> [!IMPORTANT]
> Khả năng tương thích phụ thuộc cấu trúc bài và quyền trình duyệt. Test mô phỏng không chứng minh thành công trên website có đăng nhập hoặc điểm đã lưu. Checkbox và Linking Lines có giới hạn bên dưới. Version 0.8.0 là phiên bản source, không khẳng định có Chrome Web Store hoặc GitHub Release.

<a id="quick-start"></a>
## Bắt đầu nhanh

**Cần Chrome và bản sao kho mã nguồn.** Không cần Git nếu tải source ZIP. Runtime tiện ích không cần build, Node.js hay cài dependency.

```powershell
git clone https://github.com/imnwngr/studymate.git
Set-Location studymate
```

1. Mở `chrome://extensions`, bật **Developer mode**.
2. Chọn **Load unpacked**, chọn thư mục `studymate` chứa `manifest.json`.
3. Mở bài được hỗ trợ và đợi tải xong.
4. Mở studymate, chọn **Quét bài**, kiểm tra bài/khung đã nhận diện.
5. Chọn **Giải bài**. Kết quả đủ điều kiện được áp dụng; kiểm tra kết quả chưa chắc chắn hoặc bị bỏ qua trên trang thật.

**Cập nhật:** pull source mới, reload tiện ích trong Chrome rồi làm mới tab bài tập. Nếu thư mục của tiện ích unpacked đã đổi tên, gỡ mục unpacked cũ và load thư mục mới; kiểm tra lại quyền và cài đặt.

**Nộp bài:** chỉ dùng **Hoàn tất và tiếp tục** khi nút bật và bạn muốn nộp. NGL có thể chuyển màn hình trong cùng hoạt động sau khi vượt kiểm tra. Generic không nộp hay tự chuyển trang. Nút đổi trạng thái không chứng minh điểm đã lưu.

---

<a id="features"></a>
## Luồng được hỗ trợ

| Khả năng | NGL / Spark | Bộ điều hợp Generic |
| --- | --- | --- |
| Nhận diện | Khung bài có quyền truy cập và widget nền tảng được hỗ trợ | Điều khiển HTML gốc trong nhóm bài rõ ràng |
| Nguồn đáp án | QTI được hỗ trợ; dự phòng đã cấu hình là tùy chọn | QTI nhúng tương thích, định danh phản hồi duy nhất |
| Điền | Văn bản, dropdown, radio, chọn nhiều, sắp xếp và sửa từ, tùy kiểm tra widget | Input, select, radio, checkbox gốc; từ chối điều khiển/ánh xạ không hỗ trợ |
| Word Pool | Trả mọi thẻ, xác nhận ô trống rồi điền theo QTI | Không có giao thức word-pool riêng nền tảng |
| Checkbox | ID QTI và kiểm tra tập lựa chọn; popup có thể chặn một số đáp án chọn nhiều | Áp dụng checked-state gốc với ánh xạ tương thích |
| Linking Lines | Ánh xạ đầu nối QTI và gửi thao tác; đồ thị cuối chưa xác minh | Không hỗ trợ widget nối tùy biến |
| Nộp / chuyển màn hình | Nộp chủ động và chuyển trong hoạt động có kiểm tra | Không hỗ trợ |

QTI XML hoặc XML bọc JSON được phân tích có giới hạn, không thực thi script nhúng. Khai báo đáp án trên trang không tự chứng minh nguồn phát hành hoặc điểm số đúng.

Word Pool chạy **Trả hết → Xác nhận trống → Điền → Kiểm tra ánh xạ**, cả với bài đã điền còn sửa được. Dừng khi không xác minh được chuyển trạng thái; thay đổi từng phần thành công có thể còn lại. Đợi xong trước khi thao tác tiếp.

### AI và ngoại tuyến tùy chọn

Luồng NGL có thể dùng nhà cung cấp tương thích OpenAI đã cấu hình hoặc quy tắc ngoại tuyến hạn chế. API gửi câu hỏi/lựa chọn tới nhà cung cấp và có thể phát sinh phí. Ngoại tuyến không gọi nhà cung cấp đó. Gợi ý AI/nhập tay cho Generic không đủ quyền Apply khi thiếu ánh xạ cục bộ cần thiết.

### Bốn phong cách giao diện

| Phong cách | Cách trình bày |
| --- | --- |
| Ventrix | Chữ căn giữa, ánh tím ở chân nền |
| Chainsaw Editorial | Tiêu đề có chân, khung đen và đỏ |
| Cognify | Điều khiển rõ ràng, điểm nhấn cyan |
| InsightOS | Mảng tối, điểm nhấn xanh chanh |

Chọn phong cách trong **Cài đặt**, tự động lưu. Có theme sáng, tối, theo hệ thống và ngôn ngữ Anh, Việt, Trung giản thể, Trung phồn thể. Đổi giao diện không đổi khả năng giải.

<a id="inspector"></a>
## Inspector

Inspector quan sát; không giải, nộp, mô phỏng thao tác hoặc xác nhận đáp án đúng.

1. Mở Inspector từ đúng tab nguồn, kiểm tra phạm vi khung.
2. Chụp trạng thái hoặc bắt đầu ghi rồi thao tác thủ công.
3. Dừng ghi, đọc cảnh báo phạm vi, thiếu trạng thái đầu/cuối và cắt dữ liệu.
4. Xuất JSON, kiểm tra trước chia sẻ.

Phiên ghi có giới hạn, tự dừng sau ba phút. Điều hướng trang chính dừng phiên; các thế hệ tài liệu khung con được theo dõi riêng. NGL deep capture và Generic structural capture giữ loại bằng chứng khác nhau.

Chọn `inspector-data/exports` nếu trình chọn thư mục được hỗ trợ. Chrome có thể hỏi lại quyền. Nếu không, dùng Save As hoặc cài đặt tải xuống rồi chép export vào đó. Tiện ích không tự ghi vào thư mục source khi chưa được cho phép.

Phân tích cục bộ tùy chọn chỉ cần Node.js và module có sẵn:

```powershell
# Chạy từ thư mục gốc của kho.
node .\tools\analyze-inspector.cjs
```

Báo cáo/prompt là đề xuất cho bước phát triển được cho phép riêng, không tự sửa adapter. Xem [quy trình Inspector](inspector-data/README.md), [Universal Inspector](docs/UNIVERSAL_INSPECTOR.md), [bằng chứng chi tiết](docs/inspector-deep.md).

---

<a id="privacy"></a>
## Riêng tư và quyền truy cập

| Quyền / dữ liệu | Mục đích và giới hạn |
| --- | --- |
| `activeTab`, `scripting` | Truy cập do người dùng yêu cầu và chèn script vào khung có quyền |
| `webNavigation` | Tìm cấu trúc khung của tab |
| `storage` | Lưu tùy chọn và cấu hình nhà cung cấp cục bộ |
| Host khai báo | NGL, khung Avallain và origin API OpenAI |
| HTTPS / localhost tùy chọn | Endpoint/khung được cho phép; khai báo không tự cấp quyền |

Khung khác origin có thể cần quyền riêng. Trang trình duyệt bị hạn chế và Shadow DOM đóng không truy cập được. Khóa/cấu hình lưu trong Chrome local storage, không phải kho bí mật bảo vệ tuyệt đối.

Inspector không chủ động đọc cookie, kho xác thực hay mô hình ứng dụng. Giá trị nhập được che, nhưng nội dung NGL, đáp án chọn, ID DOM, tiêu đề và đường dẫn URL có thể còn. Một số chẩn đoán lỗi Solve có thể chứa nội dung đáp án. **Kiểm tra export/log trước chia sẻ; tránh trang nhạy cảm.**

Recordings, reports, prompts, browser profiles, credentials và artifacts local được giữ ngoài Git bằng ignore rules. Các quy tắc không xác định gói ZIP an toàn. Schema, tên export, storage key và hợp đồng `SPARK_*` giữ tên tương thích; NGL / Spark vẫn là tên nền tảng bên ngoài.

<a id="structure"></a>
## Cấu trúc dự án

```text
studymate/
├── manifest.json             Metadata và quyền tiện ích
├── popup.* / options.*       Luồng bài tập và Cài đặt
├── core/                    Đăng ký site, khung và runtime
├── adapters/                Nhận diện/áp dụng NGL và Generic
├── answer-sources/          Tích hợp QTI nhúng
├── solvers/                 Bộ giải tương tác dùng chung
├── inspector*.js            Capture và export chỉ đọc
├── tools/                   Phân tích cục bộ tùy chọn
├── tests/                   Node test và fixture browser mô phỏng
├── docs/                    Kiến trúc và quy trình
└── inspector-data/          Dữ liệu riêng tư; chỉ track README/placeholder
```

<a id="development"></a>
## Phát triển và kiểm thử

Test Node không cần npm package. Fixture Chrome cần Chrome/Chromium đã cài; runner hỗ trợ nhận `SPARK_BROWSER`. Runner Python tùy chọn cần Python và Playwright.

```powershell
node --test --test-isolation=none tests/*.test.js tests/*.test.cjs
node tests/run-browser-wordpool.cjs
node tests/run-browser-multisite.cjs
node tests/run-browser-inspector-universal.cjs
node tests/run-browser-linking.cjs
```

Test bằng chứng riêng tư có thể skip khi thiếu fixture local; một số kiểm tra phát triển vẫn tham chiếu tệp audit bị ignore. Bảo toàn thay đổi không liên quan và phân biệt test mô phỏng với website có đăng nhập. Đọc [kiến trúc multisite](docs/MULTISITE_ARCHITECTURE.md) trước khi đổi hợp đồng runtime.

<a id="limitations"></a>
## Giới hạn đã biết

- Popup Checkbox có thể chặn một số đáp án chọn nhiều trước Apply.
- Linking Lines gửi thao tác nhưng chưa xác minh chính xác kết nối cuối; kiểm tra thủ công.
- Nhiều khung bài có thể gây mơ hồ; kiểm tra bài đã chọn.
- Generic cần ánh xạ nhúng tương thích; có thể từ chối widget tùy biến hoặc DOM cũ.
- Thao tác trả Word Pool và trạng thái được ứng dụng giữ lại vẫn cần retest có đăng nhập cho bài cụ thể.
- Test mô phỏng thành công không chứng minh tương thích site thật hoặc điểm đã lưu.

---

[Kho mã nguồn](https://github.com/imnwngr/studymate) · [Changelog](CHANGELOG.md) · [English guide](README.md)

Không có tệp giấy phép độc lập. Đổi tên không cấp quyền phân phối mới.
