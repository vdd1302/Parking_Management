import re
from datetime import date, datetime, time, timedelta
from functools import wraps
from zoneinfo import ZoneInfo

from flask import current_app, g, jsonify, request
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

from .extensions import db
from .models import User


class APIError(Exception):
    """Lỗi nghiệp vụ trả về cho client dưới dạng {error: {code, message, details}}."""

    def __init__(self, code, message, status=400, details=None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.details = details

    def to_response(self):
        body = {"error": {"code": self.code, "message": self.message}}
        if self.details is not None:
            body["error"]["details"] = self.details
        return jsonify(body), self.status


def register_error_handlers(app):
    @app.errorhandler(APIError)
    def handle_api_error(err):
        db.session.rollback()
        return err.to_response()

    @app.errorhandler(404)
    def handle_404(_err):
        return APIError("NOT_FOUND", "Không tìm thấy tài nguyên", 404).to_response()

    @app.errorhandler(405)
    def handle_405(_err):
        return APIError("METHOD_NOT_ALLOWED", "Phương thức không được hỗ trợ", 405).to_response()

    @app.errorhandler(500)
    def handle_500(_err):
        db.session.rollback()
        return APIError("INTERNAL_ERROR", "Lỗi hệ thống, vui lòng thử lại", 500).to_response()


def auth_required(*roles):
    """Yêu cầu JWT hợp lệ, tài khoản còn hoạt động và (tuỳ chọn) thuộc một trong các vai trò.

    Trạng thái tài khoản được kiểm tra lại ở mỗi request nên việc khoá tài khoản có hiệu lực ngay.
    """

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            user = db.session.get(User, int(get_jwt_identity()))
            if user is None or not user.is_active:
                raise APIError("ACCOUNT_DISABLED", "Tài khoản không tồn tại hoặc đã bị khoá", 401)
            if roles and user.role not in roles:
                raise APIError("FORBIDDEN", "Bạn không có quyền thực hiện chức năng này", 403)
            g.current_user = user
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def get_json():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise APIError("INVALID_DATA", "Dữ liệu gửi lên phải là JSON object")
    return data


def require_str(data, field, label, max_len=255, required=True):
    value = data.get(field)
    if value is None or (isinstance(value, str) and not value.strip()):
        if required:
            raise APIError("INVALID_DATA", f"{label} không được để trống", details={"field": field})
        return None
    if not isinstance(value, str):
        raise APIError("INVALID_DATA", f"{label} không hợp lệ", details={"field": field})
    value = value.strip()
    if len(value) > max_len:
        raise APIError("INVALID_DATA", f"{label} tối đa {max_len} ký tự", details={"field": field})
    return value


def require_int(data, field, label, min_value=None, required=True):
    value = data.get(field)
    if value is None or value == "":
        if required:
            raise APIError("INVALID_DATA", f"{label} không được để trống", details={"field": field})
        return None
    if isinstance(value, bool):
        raise APIError("INVALID_DATA", f"{label} phải là số nguyên", details={"field": field})
    try:
        value = int(value)
    except (TypeError, ValueError):
        raise APIError("INVALID_DATA", f"{label} phải là số nguyên", details={"field": field})
    if min_value is not None and value < min_value:
        raise APIError("INVALID_DATA", f"{label} phải lớn hơn hoặc bằng {min_value}", details={"field": field})
    return value


# Biển số Việt Nam sau khi bỏ khoảng trắng, dấu '-' và '.': 2 số mã tỉnh, 1-2 chữ cái
# seri, tiếp theo 4-6 chữ số. VD: 29A12345 (29A-123.45), 59X112345 (59-X1 123.45), 51LD12345
PLATE_PATTERN = re.compile(r"^\d{2}[A-Z]{1,2}\d{4,6}$")


def normalize_plate(raw):
    """Trả về (biển số hiển thị, khoá so khớp)."""
    if not isinstance(raw, str) or not raw.strip():
        raise APIError("INVALID_PLATE", "Biển số không được để trống", details={"field": "plate_number"})
    display = re.sub(r"\s+", " ", raw.strip().upper())
    key = re.sub(r"[^A-Z0-9]", "", display)
    if not PLATE_PATTERN.match(key):
        raise APIError(
            "INVALID_PLATE",
            "Biển số không đúng định dạng (VD: 29A-123.45, 59X1-123.45)",
            details={"field": "plate_number"},
        )
    return display[:20], key


def app_tz():
    return ZoneInfo(current_app.config["APP_TIMEZONE"])


def parse_date_range(args):
    """Đọc from/to (YYYY-MM-DD, theo giờ địa phương) -> (start_utc, end_utc_exclusive, from_date, to_date)."""
    try:
        today = datetime.now(app_tz()).date()
        from_date = date.fromisoformat(args["from"]) if args.get("from") else today
        to_date = date.fromisoformat(args["to"]) if args.get("to") else today
    except ValueError:
        raise APIError("INVALID_DATA", "Ngày không hợp lệ, định dạng YYYY-MM-DD")
    if from_date > to_date:
        raise APIError("INVALID_DATA", "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc")
    if (to_date - from_date).days > 366:
        raise APIError("INVALID_DATA", "Khoảng thời gian thống kê tối đa 1 năm")
    tz = app_tz()
    start = datetime.combine(from_date, time.min, tzinfo=tz)
    end = datetime.combine(to_date + timedelta(days=1), time.min, tzinfo=tz)
    return start, end, from_date, to_date


def paginate(query, args, default_per_page=20, max_per_page=100):
    try:
        page = max(int(args.get("page", 1) or 1), 1)
        per_page = min(max(int(args.get("per_page", default_per_page) or default_per_page), 1), max_per_page)
    except ValueError:
        raise APIError("INVALID_DATA", "Tham số phân trang không hợp lệ")
    result = db.paginate(query, page=page, per_page=per_page, error_out=False)
    return {
        "items": [item.to_dict() for item in result.items],
        "page": result.page,
        "per_page": result.per_page,
        "total": result.total,
        "pages": result.pages,
    }
