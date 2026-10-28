# studymate v0.8.0

Tiện ích Chrome Manifest V3 để xem và điền các dạng bài được hỗ trợ, với NGL / Spark, Generic thận trọng, AI dự phòng tùy chọn và Inspector chỉ đọc.

[English](README.md) · [Kho mã nguồn](https://github.com/imnwngr/spark-study-assistant) · [Lịch sử thay đổi](CHANGELOG.md)

## Tính năng

| Thành phần | Hành vi và giới hạn hiện tại |
| --- | --- |
| NGL / Spark | Tìm bài trong khung có quyền truy cập; xử lý QTI cho ô văn bản, dropdown, radio, chọn nhiều, sắp xếp từ và sửa từ. Hỗ trợ phụ thuộc DOM của bài. |
| Word Pool | Trả mọi thẻ bằng giao diện website, xác nhận các ô trống rồi điền lại theo QTI đã kiểm tra. Bài đã điền còn chỉnh sửa được cũng chạy Trả hết → Điền lại. Dừng nếu không xác minh được thao tác; thay đổi từng phần có thể còn lại. |
| Checkbox | Ánh xạ ID lựa chọn QTI và kiểm tra tập lựa chọn. Kiểm tra option trong popup vẫn có thể chặn một số đáp án chọn nhiều trước Apply. |
| Linking Lines | Ánh xạ nhãn đầu nối duy nhất theo cặp QTI và gửi thao tác nối. Chưa quan sát được chính xác kết nối cuối cùng, nên kết quả chưa chắc chắn và cần kiểm tra thủ công. |
| Generic | Nhận diện input, select, radio, checkbox HTML gốc trong nhóm bài rõ ràng. Apply cần định danh phản hồi duy nhất và QTI nhúng tương thích. Từ chối widget tùy biến/ánh xạ mơ hồ. Không nộp hay tự chuyển trang. |
| QTI | Phân tích XML hoặc XML bọc JSON có giới hạn, không thực thi script. Đáp án trên trang không tự chứng minh nguồn phát hành hoặc điểm đã lưu. |
| Dự phòng tùy chọn | NGL có thể dùng nhà cung cấp tương thích OpenAI hoặc quy tắc ngoại tuyến hạn chế. Gợi ý AI/nhập tay cho Generic không đủ quyền Apply nếu thiếu ánh xạ cục bộ cần thiết. |
| Inspector | Chụp trạng thái chỉ đọc, ghi tương tác có giới hạn, báo phạm vi khung, bằng chứng NGL chi tiết, cấu trúc Generic và xuất JSON cục bộ. Không giải, nộp hoặc xác nhận đáp án đúng. |
| Giao diện | Ventrix, Chainsaw Editorial, Cognify, InsightOS. Theme sáng, tối, theo hệ thống; tiếng Anh, Việt, Trung giản thể và Trung phồn thể. |

Generic không đồng nghĩa hỗ trợ mọi website. Test mô phỏng không chứng minh hoạt động trên website có đăng nhập, sự kiện mô phỏng được chấp nhận hoặc điểm đã lưu.

## Cài đặt và sử dụng

1. Tải hoặc clone kho này. Runtime tiện ích không cần build hay cài dependency.
2. Mở `chrome://extensions`, bật **Developer mode**, chọn **Load unpacked** và thư mục chứa `manifest.json`.
3. Sau khi cập nhật thư mục, reload tiện ích rồi làm mới tab bài tập.
4. Mở studymate, chọn **Quét bài**, xem bài đã nhận diện rồi chọn **Giải bài**. Đáp án đủ điều kiện được áp dụng; kiểm tra trang thực tế và kết quả bị bỏ qua/chưa chắc chắn.
5. Đợi Word Pool hoàn tất Trả hết → Điền lại trước khi thao tác tiếp.
6. Chỉ dùng **Hoàn tất và tiếp tục** khi nút bật và bạn muốn nộp. NGL có thể chuyển màn hình trong hoạt động sau kiểm tra. Nộp vẫn là thao tác chủ động, không bảo đảm điểm đã lưu.

Cài đặt chứa ngôn ngữ, nhà cung cấp, chuyển bài và giao diện. Phong cách tự lưu. AI là tùy chọn, có thể phát sinh phí. Phiên bản 0.8.0 chỉ phiên bản mã nguồn này; không ngụ ý đã có Web Store hoặc GitHub Release.

## Quyền truy cập và riêng tư

- **activeTab**, **scripting**, **webNavigation**, **storage** phục vụ truy cập do người dùng yêu cầu, chèn script, tìm khung và lưu cấu hình.
- Quyền host khai báo gồm NGL, khung Avallain và origin API OpenAI. Quyền HTTPS/localhost tùy chọn phục vụ endpoint/khung được cho phép; khai báo không tự cấp quyền. Khung khác origin có thể cần quyền riêng.
- Trang trình duyệt bị hạn chế và Shadow DOM đóng không truy cập được. Nhiều khung bài có thể gây mơ hồ; kiểm tra bài đã chọn.
- Khóa/cấu hình lưu trong Chrome local storage, không phải kho bí mật bảo vệ tuyệt đối. API gửi câu hỏi/lựa chọn tới nhà cung cấp đã chọn; ngoại tuyến không gọi nhà cung cấp.
- Inspector không chủ động đọc cookie, kho xác thực hay mô hình ứng dụng. Giá trị nhập được che nhưng nội dung NGL, đáp án chọn, ID DOM, tiêu đề và đường dẫn URL có thể còn. Một số chẩn đoán lỗi Solve chứa nội dung đáp án. Kiểm tra tệp xuất/log trước chia sẻ.

## Inspector và phân tích cục bộ

Mở Inspector từ đúng tab nguồn, kiểm tra phạm vi khung, chụp hoặc bắt đầu ghi, thao tác, dừng rồi xuất JSON. Điều hướng trang chính dừng phiên. Ghi có giới hạn và tự dừng sau ba phút; đọc cảnh báo phạm vi/cắt dữ liệu.

Chọn `inspector-data/exports` khi có trình chọn thư mục. Có thể cần cấp lại quyền. Nếu không, dùng Save As/cài đặt tải xuống rồi chép JSON vào đó. Tiện ích không tự ghi vào thư mục nguồn khi chưa có quyền. Tên tệp Spark và version schema Inspector cũ được giữ để tương thích.

Phân tích tùy chọn dùng module Node.js có sẵn:

```powershell
Set-Location 'C:\projects\spark-study-assistant'
node .\tools\analyze-inspector.cjs
```

Báo cáo/prompt chỉ là đề xuất phát triển cần cho phép riêng, không tự sửa adapter. Không đưa recordings, phân tích sinh tự động, profiles, ảnh, log hay credentials vào Git/gói chia sẻ. Git ignore không xác định một gói ZIP an toàn.

## Phát triển và giới hạn

Runtime ở `core/`, `adapters/`, `solvers/`, `answer-sources/`. Test Node không cần npm package:

```powershell
node --test --test-isolation=none tests/*.test.js tests/*.test.cjs
node tests/run-browser-wordpool.cjs
```

Fixture browser cần Chrome/Chromium đã cài; runner hỗ trợ có thể dùng `SPARK_BROWSER`. Runner Python tùy chọn cần Python và Playwright. Test bằng chứng riêng tư có thể skip khi thiếu fixture; một số kiểm tra phát triển còn cần tệp audit bị ignore. Bảo toàn thay đổi không liên quan.

Cập nhật này chỉ đổi metadata phiên bản và tài liệu. Thao tác trả Word Pool, chọn khung và giới hạn Checkbox/Linking Lines vẫn cần retest có đăng nhập. Không tạo tag hoặc GitHub Release.

NGL / Spark là nền tảng bên ngoài. Kho giữ tên `spark-study-assistant` và định danh tương thích. Không có tệp giấy phép độc lập; cập nhật này không cấp quyền phân phối mới.
