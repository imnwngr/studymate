# studymate

Tiện ích Chrome Manifest V3 để đọc, xem lại và điền các dạng bài tập được hỗ trợ. studymate có bộ điều hợp NGL / Spark, khả năng nhận diện thận trọng các điều khiển HTML gốc trên website khác, AI dự phòng có cấu hình, bốn phong cách giao diện và Inspector chỉ đọc.

[English](README.md) · [Kho mã nguồn](https://github.com/imnwngr/spark-study-assistant) · [Lịch sử thay đổi](CHANGELOG.md)

## Trạng thái phát hành

Manifest vẫn ở phiên bản **0.7.16**. **v0.8.0 mới là bản phát hành dự kiến, chưa được công bố hoặc xác minh đầy đủ.** Cây làm việc chứa các thay đổi đang phát triển, bao gồm tích hợp hoãn phát hành cần được loại khỏi bản công bố. Tài liệu không khẳng định số bài kiểm thử đạt hiện tại hoặc khả năng tương thích đã được xác nhận trên website có đăng nhập.

Tên dự án hiện tại là **studymate**. Kho GitHub và thư mục cục bộ hiện có vẫn mang tên `spark-study-assistant`. Các định danh cần giữ tương thích và tùy chọn đã lưu tiếp tục dùng tên cũ.

## Tính năng và môi trường hỗ trợ

| Thành phần | Triển khai hiện tại và giới hạn |
| --- | --- |
| NGL / Spark | Tìm bài trong các khung có quyền truy cập; ánh xạ QTI; xử lý ô văn bản, danh sách chọn, radio, chọn nhiều đáp án, sắp xếp từ và sửa từ. Khả năng hỗ trợ phụ thuộc cấu trúc bài cụ thể. |
| Word Pool | Trả các thẻ đã điền bằng giao diện của website, xác nhận mọi ô trống rồi điền lại theo QTI. Bài có thể chỉnh sửa nhưng đã điền cũng chạy Trả hết → Điền lại. Việc xác định hộp gốc, ô đã có thẻ và trạng thái được giữ lại vẫn cần xem xét. |
| Checkbox | Ánh xạ ID QTI và kiểm tra toàn bộ tập lựa chọn cuối cùng. Một điều kiện kiểm tra trong popup hiện có thể chặn đáp án chọn nhiều trước bước Apply. |
| Linking Lines | Ánh xạ nhãn đầu nối duy nhất với cặp QTI rồi gửi thao tác nối. Bộ điều hợp chưa đọc được chính xác toàn bộ kết nối cuối cùng và trả trạng thái chưa chắc chắn. Đây chưa phải chức năng tự động giải đã được xác minh đầy đủ. |
| Generic Multisite | Nhận diện ô văn bản, select, radio và checkbox HTML gốc trong nhóm bài có định danh rõ ràng. Tự động điền cần định danh phản hồi duy nhất và QTI nhúng tương thích. Điều khiển không hỗ trợ hoặc tham chiếu DOM cũ sẽ bị từ chối. |
| Embedded QTI | Phân tích XML hoặc XML bọc trong JSON với giới hạn kích thước, không thực thi script. Đáp án khai báo trên trang không tự chứng minh nguồn phát hành đáng tin hoặc điểm số chính xác. |
| AI và quy tắc ngoại tuyến | Luồng NGL hiện có có thể dùng nhà cung cấp tương thích OpenAI đã cấu hình hoặc bộ quy tắc ngoại tuyến hạn chế. Gợi ý Generic thiếu ánh xạ cục bộ đã kiểm tra không đủ điều kiện Apply. |
| Giao diện | Ventrix, Chainsaw Editorial, Cognify và InsightOS; chế độ sáng, tối, theo hệ thống; tiếng Anh, Việt, Trung giản thể và Trung phồn thể. |
| Inspector | Chụp trạng thái DOM và ghi tương tác có giới hạn, báo phạm vi khung, bằng chứng NGL chi tiết, cấu trúc điều khiển Generic và xuất JSON cục bộ. |

Generic không đồng nghĩa với hỗ trợ mọi website. Widget tùy biến, khung không truy cập được, bài không rõ định danh và thiếu nguồn đáp án có thể khiến thao tác bị từ chối. Không quảng bá bộ điều hợp riêng đang hoãn phát hành là được hỗ trợ.

## Cài đặt

1. Tải hoặc clone [kho mã nguồn hiện tại](https://github.com/imnwngr/spark-study-assistant).
2. Mở `chrome://extensions` và bật **Developer mode**.
3. Chọn **Load unpacked**, rồi chọn thư mục chứa `manifest.json`.
4. Mở website học tập cần dùng. Sau khi cập nhật tiện ích, tải lại tiện ích và làm mới tab bài tập.
5. Mở **studymate** từ thanh công cụ tiện ích.

Runtime hiện tại dùng script thông thường và không cần bước build. Mã đã công bố trên kho có thể khác bản phát triển cục bộ này. Không giả định đã có bản tải v0.8.0.

## Sử dụng

1. Mở bài tập và đợi tải xong.
2. Mở studymate, dùng **Quét bài** để xem bài đã nhận diện.
3. Chọn **Giải bài**. Popup đọc nguồn đáp án và gọi Apply cho kết quả đủ điều kiện.
4. Kiểm tra trạng thái thực tế trên website cùng các kết quả chưa chắc chắn hoặc bị bỏ qua.
5. Chỉ dùng **Hoàn tất và tiếp tục** khi nút được bật và bạn có ý định nộp bài.

Giải bài có thể chuyển màn hình trong cùng hoạt động NGL sau khi vượt qua các bước kiểm tra. Nộp vào sổ điểm là thao tác riêng do người dùng chủ động yêu cầu. Nút nộp đổi trạng thái không tự chứng minh điểm đã lưu. Bộ điều hợp Generic không hỗ trợ nộp bài hoặc tự chuyển trang.

Cấu hình nhà cung cấp, ngôn ngữ, giao diện và tùy chọn chuyển bài trong **Cài đặt**. API là tùy chọn và có thể phát sinh phí. Lưu cấu hình nhà cung cấp để yêu cầu quyền truy cập endpoint. Lựa chọn phong cách giao diện được lưu tự động.

## Inspector

1. Mở Inspector từ studymate khi đang chọn đúng tab nguồn.
2. Kiểm tra phạm vi khung và chỉ cấp quyền cho các origin bạn muốn kiểm tra.
3. Chụp trạng thái hoặc bắt đầu ghi rồi thao tác thủ công.
4. Dừng ghi; đọc cảnh báo về khung không truy cập được, dữ liệu bị cắt và thiếu trạng thái đầu/cuối.
5. Xuất JSON và kiểm tra trước khi chia sẻ.

Inspector giữ nguyên tab nguồn đã chọn. Điều hướng trang chính dừng phiên; các thế hệ tài liệu của khung con được phân biệt. Phiên tự dừng sau ba phút. Inspector không giải, nộp, mô phỏng thao tác hoặc xác nhận đáp án đúng.

Chọn `inspector-data/exports` trong kho mã nguồn khi trình duyệt hỗ trợ chọn thư mục. Quyền ghi có thể cần cấp lại. Nếu không, dùng Save As; trình duyệt không hỗ trợ trình chọn sẽ dùng cài đặt tải xuống. Tiện ích không tự suy ra đường dẫn tuyệt đối của kho hoặc tự cấp quyền hệ thống tệp.

Tên tệp xuất, dấu nhận dạng schema và định danh thư mục đã lưu vẫn giữ tên Spark cũ để tương thích.

Các trình phân tích cục bộ trong `tools/` là tiện ích phát triển tùy chọn, không phải thành phần runtime bắt buộc. Báo cáo và prompt được tạo chỉ là đề xuất cho bước phát triển riêng cần được cho phép.

## Quyền truy cập

- **activeTab**: quyền tạm thời gắn với thao tác mở tiện ích của người dùng.
- **scripting**: chèn script cần thiết vào khung có quyền truy cập.
- **webNavigation**: tìm cấu trúc khung của tab.
- **storage**: lưu tùy chọn và cấu hình nhà cung cấp cục bộ.
- Quyền host hiện có bao gồm NGL, khung Avallain và origin API OpenAI đã khai báo.
- Quyền HTTPS và localhost tùy chọn phục vụ endpoint hoặc khung được cho phép rõ ràng. Khai báo quyền tùy chọn không tự cấp quyền đó.

Khung khác origin có thể cần quyền riêng. Trang trình duyệt bị hạn chế, khung bị từ chối và Shadow DOM đóng không truy cập được.

## Quyền riêng tư và dữ liệu cục bộ

Khóa API và cấu hình được lưu trong Chrome local storage; đây không phải kho bí mật được bảo vệ tuyệt đối. Lệnh gọi API gửi câu hỏi và lựa chọn tới nhà cung cấp đã chọn. Chế độ ngoại tuyến không thực hiện các lệnh gọi nhà cung cấp đó.

Inspector không chủ động đọc cookie, kho xác thực hoặc mô hình nội bộ của ứng dụng. Giá trị có thể nhập được che đi, nhưng tệp xuất **không được bảo đảm đã ẩn danh**: nội dung bài NGL, đáp án đã chọn, định danh DOM, tiêu đề và đường dẫn URL có thể còn lại. Generic ghi cấu trúc điều khiển và trạng thái lựa chọn. Tránh ghi trang nhạy cảm và kiểm tra mọi tệp trước khi chia sẻ.

Một số chẩn đoán lỗi Solve hiện có thể chứa nội dung đáp án. Đây là vấn đề riêng tư còn tồn tại, không phải cam kết log đã được làm sạch.

Không đưa bản ghi, báo cáo, prompt, hồ sơ trình duyệt, ảnh chụp, log, thông tin xác thực hoặc tệp kiểm tra cục bộ vào commit và gói phát hành. `.gitignore` không kiểm soát mọi cách tạo ZIP; cần danh sách tệp production được duyệt.

## Giới hạn đã biết

- Linking Lines chưa xác minh chính xác toàn bộ kết nối cuối cùng.
- Kiểm tra nhiều đáp án checkbox cần được sửa để sử dụng ổn định từ đầu đến cuối.
- Popup hiện có thể chọn nhầm khi có nhiều khung bài tập.
- Generic Apply cần ánh xạ nhúng riêng; gợi ý AI hoặc nhập tay chưa đủ.
- Khi DOM Generic bị thay thế, tiện ích thường từ chối an toàn và yêu cầu quét lại.
- Word Pool cần kiểm tra thực tế việc trả về hộp gốc và giả định thứ tự ô đích.
- Kiểm thử mô phỏng không chứng minh hoạt động trên website có đăng nhập hoặc điểm đã lưu.
- Cây làm việc còn tích hợp riêng đang hoãn phát hành; ZIP toàn bộ thư mục không phải bản phát hành hợp lệ.

## Phát triển và đóng góp

Runtime nằm trong `core/`, `adapters/`, `solvers/` và `answer-sources/`. Popup điều phối Quét → Giải → Điền. Khi ghi theo yêu cầu, Inspector hoạt động độc lập với Solve.

Đọc mã hiện tại và phạm vi sở hữu tệp trước khi chỉnh sửa. Giữ nguyên thay đổi không liên quan. Ưu tiên bản vá nhỏ và phân biệt quan sát với giả thuyết. Có thể dùng kiểm thử và fixture cục bộ, nhưng chúng bị loại khỏi các commit phát hành đang đề xuất và gói runtime.

Sau khi được cho phép, chạy kiểm thử Node tập trung và fixture trình duyệt cho hành vi thay đổi, rồi kiểm tra đúng tập mã được chọn. Trình chạy trình duyệt và trình phân tích có thể tạo tệp cục bộ. Kiểm thử có đăng nhập và xác nhận rõ ràng **TEST OK** vẫn là điều kiện trước khi duyệt phát hành.

## Ghi nhận và giấy phép

Kho mã nguồn vẫn ở [imnwngr/spark-study-assistant](https://github.com/imnwngr/spark-study-assistant). NGL / Spark là tên nền tảng học tập bên ngoài, không phải tên mới của tiện ích.

Không tìm thấy tệp giấy phép độc lập trong kho đã xem xét. Đổi tên không bổ sung giấy phép hoặc quyền phân phối mới. Giữ nguyên thông báo hiện có và làm rõ giấy phép với chủ kho trước khi phân phối lại.
