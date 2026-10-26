# Hệ thống quản lý bãi đỗ xe

Website quản lý bãi đỗ xe gồm 3 thành phần:

| Thành phần | Công nghệ |
|---|---|
| Frontend | React 19 + Vite (JavaScript), React Router, Axios |
| Backend | Python Flask (REST API), Flask-JWT-Extended, Flask-CORS |
| Database | PostgreSQL 16, SQLAlchemy (ORM), Flask-Migrate / Alembic (migration) |
| Quản lý mã nguồn | Git + GitHub (kèm GitHub Actions CI) |

📘 **Hướng dẫn chi tiết** (cài đặt từng bước trên Windows/macOS/Linux, thiết kế CSDL, quy trình nghiệp vụ,
hướng dẫn sử dụng theo vai trò, ảnh giao diện, đưa lên GitHub): xem [`docs/HUONG_DAN.md`](docs/HUONG_DAN.md).

## Chức năng

| # | Chức năng | Vai trò | Nơi thực hiện |
|---|---|---|---|
| 1 | Tiếp nhận phương tiện vào bãi | NV, QL | `POST /api/sessions/check-in` · trang *Xe vào bãi* |
| 2 | Theo dõi và tra cứu lượt gửi | NV, QL | `GET /api/sessions`, `GET /api/capacity` · trang *Tra cứu lượt gửi* |
| 3 | Xử lý phương tiện ra khỏi bãi và tính phí | NV, QL | `GET /api/sessions/lookup`, `POST /api/sessions/:id/checkout` · trang *Xe ra & thu phí* |
| 4 | Ghi nhận thanh toán và hoàn tất lượt gửi | NV, QL | `POST /api/sessions/:id/pay` |
| 5 | Kiểm tra và cảnh báo ngoại lệ | NV, QL | Mã lỗi `LOT_FULL`, `DUPLICATE_ACTIVE_SESSION`, `SESSION_NOT_FOUND`, `VEHICLE_MISMATCH` + `/api/incidents` · trang *Yêu cầu xác minh* |
| 6 | Quản lý thông tin và sức chứa bãi xe | QL | `/api/lot`, `/api/vehicle-types` · trang *Bãi xe & sức chứa* |
| 7 | Quản lý bảng giá dịch vụ | QL (NV chỉ xem) | `/api/prices` · trang *Bảng giá* |
| 8 | Đăng nhập và phân quyền | Tất cả | `/api/auth/*` + decorator `auth_required(...)` |
| 9 | Quản lý tài khoản người dùng *(giả định, xem bên dưới)* | QL | `/api/users` · trang *Tài khoản* |
| 10 | Thống kê lượt xe và sức chứa | QL | `GET /api/reports/traffic` |
| 11 | Thống kê doanh thu | QL | `GET /api/reports/revenue` |

> **Lưu ý:** tài liệu đặc tả gốc không có mô tả cho chức năng số 9. Chức năng này được triển khai là
> *Quản lý tài khoản người dùng* (tạo tài khoản, phân vai trò, khoá/mở khoá, đặt lại mật khẩu) vì chức năng 8
> cần có nơi quản lý tài khoản. Hãy điều chỉnh nếu đặc tả thực tế khác.

### Các quy tắc nghiệp vụ chính

- **Biển số** được chuẩn hoá (bỏ khoảng trắng, `-`, `.`, viết hoa) trước khi so khớp, nên `29a-123.45` và
  `29A12345` là cùng một xe. Định dạng hợp lệ: 2 số tỉnh + 1–2 chữ cái + 4–6 chữ số (`PLATE_PATTERN` trong
  `backend/app/utils.py`).
- **Một xe chỉ có một lượt gửi đang hoạt động**: kiểm tra trong code và được đảm bảo ở tầng DB bằng
  unique index có điều kiện `uq_parking_sessions_active_plate`.
- **Không vượt sức chứa** khi nhiều nhân viên thao tác cùng lúc: dòng `vehicle_types` được khoá
  (`SELECT … FOR UPDATE`) khi tiếp nhận xe và khi đổi sức chứa.
- **Trạng thái lượt gửi**: `ACTIVE` → (tính phí) `PENDING_PAYMENT` → (xác nhận thu tiền) `COMPLETED`.
  Lượt gửi `PENDING_PAYMENT` vẫn chiếm chỗ; chỉ khi thanh toán được xác nhận mới giải phóng sức chứa.
  Phí đã tính quá 15 phút phải tính lại trước khi xác nhận.
- **Đối chiếu khi xe ra**: nhân viên nhập biển số + loại xe thực tế. Nếu không khớp, hệ thống chặn; nhân viên
  chuyển quản lý xác minh, quản lý có thể cho xe ra kèm lý do (được lưu vào ghi chú lượt gửi).
- **Bảng giá có phiên bản**: mỗi lần cập nhật tạo bản ghi mới với thời điểm áp dụng (có thể hẹn giờ trong
  tương lai). Bảng giá đã áp dụng không sửa/xoá được; lượt gửi lưu `price_rule_id` và `fee_amount`, giao dịch
  lưu `amount`, nên đổi giá không ảnh hưởng giao dịch đã hoàn tất. Cách tính: theo lượt / theo giờ / theo
  ngày (làm tròn lên, tối thiểu 1 đơn vị).
- **Sức chứa** mới không được nhỏ hơn số xe đang gửi; không thể ngừng một loại xe khi còn xe đang gửi.
- **Tài khoản bị khoá** mất quyền ngay lập tức (trạng thái được kiểm tra lại ở mỗi request, không chỉ lúc
  đăng nhập). Quản lý không thể tự khoá hoặc tự hạ quyền chính mình.
- Thống kê theo ngày dùng múi giờ `APP_TIMEZONE` (mặc định `Asia/Ho_Chi_Minh`); thời gian lưu trong DB là UTC.

## Cấu trúc thư mục

```
parking-management/
├── backend/
│   ├── app/
│   │   ├── __init__.py        # create_app()
│   │   ├── config.py          # cấu hình từ biến môi trường
│   │   ├── models.py          # SQLAlchemy models
│   │   ├── services.py        # sức chứa, bảng giá, tính phí
│   │   ├── utils.py           # lỗi API, phân quyền, validate
│   │   ├── cli.py             # lệnh `flask seed`
│   │   └── api/               # blueprints: auth, users, lot, prices, sessions, incidents, reports
│   ├── migrations/            # Alembic (Flask-Migrate)
│   ├── tests/                 # pytest (chạy trên PostgreSQL)
│   ├── requirements.txt
│   └── wsgi.py
├── frontend/
│   ├── src/
│   │   ├── api/client.js      # axios + JWT
│   │   ├── context/           # AuthContext
│   │   ├── components/        # Layout, ProtectedRoute, UI dùng chung
│   │   └── pages/             # các trang chức năng
│   └── vite.config.js         # proxy /api -> Flask khi dev
├── docker-compose.yml         # PostgreSQL cho dev
└── .github/workflows/ci.yml   # test backend + build frontend
```

## Cài đặt và chạy

Yêu cầu: Python 3.11+, Node.js 20+, PostgreSQL 14+ (hoặc Docker).

### 1. Database

```bash
docker compose up -d          # tạo DB parking_db và parking_test (user/pass: parking/parking)
```

Hoặc dùng PostgreSQL có sẵn:

```sql
CREATE USER parking WITH PASSWORD 'parking';
CREATE DATABASE parking_db OWNER parking;
CREATE DATABASE parking_test OWNER parking;
```

### 2. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # sửa DATABASE_URL, SECRET_KEY, JWT_SECRET_KEY

flask db upgrade                   # tạo bảng
flask seed                         # dữ liệu mẫu + tài khoản demo
flask run --port 5000
```

Tài khoản demo sau khi seed:

| Vai trò | Tên đăng nhập | Mật khẩu |
|---|---|---|
| Quản lý | `admin` | `admin123` |
| Nhân viên | `staff` | `staff123` |

Đổi mật khẩu ngay khi triển khai thật (`flask seed --admin-password ... --staff-password ...` hoặc trong trang *Tài khoản*).

### 3. Frontend

```bash
cd frontend
npm install
npm run dev                        # http://localhost:5173 (proxy /api -> http://localhost:5000)
```

Build production: `npm run build` → thư mục `dist/`. Nếu frontend và API khác domain, đặt `VITE_API_URL`
khi build và thêm domain frontend vào `CORS_ORIGINS` của backend.

### 4. Chạy test

```bash
cd backend
python -m pytest -q                # dùng TEST_DATABASE_URL (mặc định parking_test)
```

## Thay đổi cấu trúc database

```bash
# sửa app/models.py, sau đó:
flask db migrate -m "mo ta thay doi"
# kiểm tra file sinh ra trong migrations/versions/ rồi:
flask db upgrade
```

## Tóm tắt REST API

Mọi endpoint (trừ `/api/auth/login`, `/api/health`) cần header `Authorization: Bearer <token>`.
Lỗi trả về dạng `{"error": {"code": "...", "message": "...", "details": {...}}}`.

| Method | Endpoint | Quyền | Mô tả |
|---|---|---|---|
| POST | `/api/auth/login` | — | Đăng nhập, trả `access_token` |
| GET | `/api/auth/me` | Tất cả | Thông tin tài khoản hiện tại |
| POST | `/api/auth/change-password` | Tất cả | Đổi mật khẩu |
| GET | `/api/dashboard` | Tất cả | Số liệu tổng quan (doanh thu chỉ với QL) |
| GET | `/api/capacity` | Tất cả | Sức chứa / đang gửi / còn trống theo loại xe |
| POST | `/api/sessions/check-in` | Tất cả | Tiếp nhận xe vào |
| GET | `/api/sessions` | Tất cả | Tra cứu: `plate, code, vehicle_type_id, status, from, to, page` |
| GET | `/api/sessions/lookup?q=` | Tất cả | Tìm lượt gửi đang hoạt động theo mã / biển số |
| GET | `/api/sessions/:id` | Tất cả | Chi tiết lượt gửi |
| POST | `/api/sessions/:id/checkout` | Tất cả | Đối chiếu, xác định giờ ra, tính phí |
| POST | `/api/sessions/:id/cancel-checkout` | Tất cả | Huỷ phí đã tính, quay về `ACTIVE` |
| POST | `/api/sessions/:id/pay` | Tất cả | Xác nhận đã thu tiền, hoàn tất lượt gửi |
| GET/POST | `/api/incidents` | Tất cả | Danh sách / tạo yêu cầu xác minh |
| POST | `/api/incidents/:id/resolve` | QL | Xử lý yêu cầu xác minh |
| GET / PUT | `/api/lot` | Tất cả / QL | Thông tin bãi xe |
| GET / POST / PUT | `/api/vehicle-types` | Tất cả / QL / QL | Loại xe và sức chứa |
| GET | `/api/prices`, `/api/prices/current` | Tất cả | Lịch sử / bảng giá hiện hành |
| POST / DELETE | `/api/prices`, `/api/prices/:id` | QL | Tạo phiên bản giá / huỷ giá chưa áp dụng |
| GET / POST / PUT | `/api/users`, `/api/users/:id` | QL | Quản lý tài khoản |
| POST | `/api/users/:id/reset-password` | QL | Đặt lại mật khẩu |
| GET | `/api/reports/traffic?from&to&vehicle_type_id` | QL | Thống kê lượt xe & sức chứa |
| GET | `/api/reports/revenue?from&to&vehicle_type_id` | QL | Thống kê doanh thu |
