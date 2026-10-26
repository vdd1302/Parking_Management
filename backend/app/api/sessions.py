"""Chức năng 1-5: tiếp nhận xe vào, tra cứu, xử lý xe ra, thanh toán và cảnh báo ngoại lệ."""
from datetime import timedelta

from flask import Blueprint, g, jsonify, request
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError

from ..extensions import db
from ..models import ParkingSession, Payment, PaymentMethod, Role, SessionStatus, VehicleType, utcnow
from ..services import calculate_fee, current_price_rule, duration_minutes, lock_vehicle_type, occupied_count
from ..utils import (
    APIError,
    app_tz,
    auth_required,
    get_json,
    normalize_plate,
    paginate,
    parse_date_range,
    require_int,
    require_str,
)

bp = Blueprint("sessions", __name__, url_prefix="/api/sessions")

# Phí đã tính quá thời hạn này phải tính lại trước khi xác nhận thu tiền
QUOTE_TTL = timedelta(minutes=15)


def _find_occupying_by_plate(plate_key):
    return db.session.scalar(
        select(ParkingSession).where(
            ParkingSession.plate_key == plate_key,
            ParkingSession.status.in_(SessionStatus.OCCUPYING),
        )
    )


def _duplicate_error(existing):
    return APIError(
        "DUPLICATE_ACTIVE_SESSION",
        f"Phương tiện {existing.plate_number} đang có lượt gửi hoạt động (mã {existing.code})",
        409,
        details={"session": existing.to_dict()},
    )


def _lock_session(session_id):
    session = db.session.scalar(
        select(ParkingSession).where(ParkingSession.id == session_id).with_for_update()
    )
    if session is None:
        raise APIError("SESSION_NOT_FOUND", "Không tìm thấy lượt gửi", 404)
    return session


@bp.post("/check-in")
@auth_required(*Role.ALL)
def check_in():
    data = get_json()
    plate_display, plate_key = normalize_plate(data.get("plate_number"))
    vehicle_type_id = require_int(data, "vehicle_type_id", "Loại phương tiện")
    note = require_str(data, "note", "Ghi chú", 255, required=False)

    # Khoá loại xe để việc kiểm tra sức chứa + tạo lượt gửi là nguyên tử
    vt = lock_vehicle_type(vehicle_type_id)
    if vt is None or not vt.is_active:
        raise APIError("INVALID_VEHICLE_TYPE", "Loại phương tiện không hợp lệ hoặc đã ngừng tiếp nhận",
                       details={"field": "vehicle_type_id"})

    if existing := _find_occupying_by_plate(plate_key):
        raise _duplicate_error(existing)

    occupied = occupied_count(vt.id)
    if occupied >= vt.capacity:
        raise APIError(
            "LOT_FULL",
            f"Bãi đã hết chỗ cho {vt.name} ({occupied}/{vt.capacity})",
            409,
            details={"vehicle_type": vt.to_dict(), "occupied": occupied},
        )

    session = ParkingSession(
        plate_number=plate_display,
        plate_key=plate_key,
        vehicle_type_id=vt.id,
        status=SessionStatus.ACTIVE,
        check_in_at=utcnow(),
        checked_in_by=g.current_user.id,
        note=note,
    )
    db.session.add(session)
    try:
        db.session.flush()
    except IntegrityError:
        # Hai request cùng biển số chạy song song: chỉ mục unique từ chối request thứ hai
        db.session.rollback()
        existing = _find_occupying_by_plate(plate_key)
        if existing:
            raise _duplicate_error(existing)
        raise
    local_date = session.check_in_at.astimezone(app_tz())
    session.code = f"LG{local_date:%y%m%d}{session.id:06d}"
    db.session.commit()

    return jsonify({
        "session": session.to_dict(),
        "capacity": {"capacity": vt.capacity, "occupied": occupied + 1, "available": vt.capacity - occupied - 1},
    }), 201


@bp.get("")
@auth_required(*Role.ALL)
def list_sessions():
    args = request.args
    query = select(ParkingSession).order_by(ParkingSession.check_in_at.desc(), ParkingSession.id.desc())

    if plate := args.get("plate", "").strip():
        key = "".join(ch for ch in plate.upper() if ch.isalnum())
        query = query.where(ParkingSession.plate_key.contains(key))
    if code := args.get("code", "").strip():
        query = query.where(ParkingSession.code.ilike(f"%{code}%"))
    if type_id := args.get("vehicle_type_id", type=int):
        query = query.where(ParkingSession.vehicle_type_id == type_id)
    if status := args.get("status"):
        statuses = [s for s in status.split(",") if s in SessionStatus.ALL]
        if not statuses:
            raise APIError("INVALID_DATA", "Trạng thái không hợp lệ")
        query = query.where(ParkingSession.status.in_(statuses))
    if args.get("from") or args.get("to"):
        start, end, *_ = parse_date_range(args)
        query = query.where(ParkingSession.check_in_at >= start, ParkingSession.check_in_at < end)

    return jsonify(paginate(query, args))


@bp.get("/lookup")
@auth_required(*Role.ALL)
def lookup_active():
    """Tìm lượt gửi đang hoạt động theo mã lượt gửi hoặc biển số (dùng khi xe ra)."""
    q = request.args.get("q", "").strip().upper()
    if not q:
        raise APIError("INVALID_DATA", "Nhập mã lượt gửi hoặc biển số")
    key = "".join(ch for ch in q if ch.isalnum())
    session = db.session.scalar(
        select(ParkingSession).where(
            ParkingSession.status.in_(SessionStatus.OCCUPYING),
            or_(ParkingSession.code == key, ParkingSession.plate_key == key),
        )
    )
    if session is None:
        raise APIError(
            "SESSION_NOT_FOUND",
            f"Không tìm thấy lượt gửi đang hoạt động với '{q}'. Kiểm tra lại vé/biển số hoặc chuyển quản lý xác minh.",
            404,
            details={"query": q},
        )
    return jsonify(session.to_dict())


@bp.get("/<int:session_id>")
@auth_required(*Role.ALL)
def get_session(session_id):
    session = db.session.get(ParkingSession, session_id)
    if session is None:
        raise APIError("SESSION_NOT_FOUND", "Không tìm thấy lượt gửi", 404)
    return jsonify(session.to_dict())


@bp.post("/<int:session_id>/checkout")
@auth_required(*Role.ALL)
def checkout(session_id):
    """Đối chiếu phương tiện thực tế với lượt gửi, xác định thời điểm ra và tính phí.

    Lượt gửi chuyển sang PENDING_PAYMENT và vẫn chiếm chỗ cho tới khi xác nhận thu tiền.
    Gọi lại khi đang PENDING_PAYMENT sẽ tính lại theo thời điểm hiện tại.
    """
    data = get_json()
    session = _lock_session(session_id)
    if session.status not in SessionStatus.OCCUPYING:
        raise APIError("SESSION_NOT_ACTIVE", f"Lượt gửi {session.code} đã kết thúc", 409)

    _, plate_key = normalize_plate(data.get("plate_number"))
    vehicle_type_id = require_int(data, "vehicle_type_id", "Loại phương tiện")

    mismatches = []
    if plate_key != session.plate_key:
        mismatches.append({"field": "plate_number", "expected": session.plate_number, "actual": data["plate_number"]})
    if vehicle_type_id != session.vehicle_type_id:
        actual_type = db.session.get(VehicleType, vehicle_type_id)
        mismatches.append({
            "field": "vehicle_type_id",
            "expected": session.vehicle_type.name,
            "actual": actual_type.name if actual_type else str(vehicle_type_id),
        })

    override_note = None
    if mismatches:
        if not (data.get("override") and g.current_user.role == Role.MANAGER):
            raise APIError(
                "VEHICLE_MISMATCH",
                "Thông tin phương tiện không khớp với lượt gửi. Không thể cho xe ra, hãy chuyển quản lý xác minh.",
                409,
                details={"mismatches": mismatches, "session": session.to_dict()},
            )
        override_note = require_str(data, "override_note", "Lý do xác minh", 200)

    now = utcnow()
    rule = current_price_rule(session.vehicle_type_id, now)
    if rule is None:
        raise APIError(
            "NO_PRICE_RULE",
            f"Chưa có bảng giá hợp lệ cho {session.vehicle_type.name}. Liên hệ quản lý để thiết lập.",
            409,
        )

    minutes = duration_minutes(session.check_in_at, now)
    session.check_out_at = now
    session.duration_minutes = minutes
    session.price_rule_id = rule.id
    session.fee_amount = calculate_fee(rule, minutes)
    session.checked_out_by = g.current_user.id
    session.status = SessionStatus.PENDING_PAYMENT
    if override_note:
        session.note = f"[QL xác minh] {override_note}"[:255]
    db.session.commit()
    return jsonify(session.to_dict())


@bp.post("/<int:session_id>/cancel-checkout")
@auth_required(*Role.ALL)
def cancel_checkout(session_id):
    session = _lock_session(session_id)
    if session.status != SessionStatus.PENDING_PAYMENT:
        raise APIError("INVALID_STATE", "Lượt gửi không ở trạng thái chờ thanh toán", 409)
    session.status = SessionStatus.ACTIVE
    session.check_out_at = None
    session.duration_minutes = None
    session.fee_amount = None
    session.price_rule_id = None
    session.checked_out_by = None
    db.session.commit()
    return jsonify(session.to_dict())


@bp.post("/<int:session_id>/pay")
@auth_required(*Role.ALL)
def confirm_payment(session_id):
    """Nhân viên xác nhận đã thu tiền: lưu giao dịch, kết thúc lượt gửi, giải phóng chỗ."""
    data = get_json()
    session = _lock_session(session_id)
    if session.status == SessionStatus.COMPLETED:
        raise APIError("ALREADY_PAID", f"Lượt gửi {session.code} đã được thanh toán", 409)
    if session.status != SessionStatus.PENDING_PAYMENT:
        raise APIError("INVALID_STATE", "Cần xác định giờ ra và tính phí trước khi thanh toán", 409)
    if utcnow() - session.check_out_at > QUOTE_TTL:
        raise APIError("QUOTE_EXPIRED", "Phí đã tính quá 15 phút, vui lòng tính lại phí", 409)

    method = data.get("method", PaymentMethod.CASH)
    if method not in PaymentMethod.ALL:
        raise APIError("INVALID_DATA", "Hình thức thanh toán không hợp lệ", details={"field": "method"})

    payment = Payment(
        session_id=session.id,
        amount=session.fee_amount,
        method=method,
        paid_at=utcnow(),
        received_by=g.current_user.id,
        note=require_str(data, "note", "Ghi chú", 255, required=False),
    )
    db.session.add(payment)
    session.status = SessionStatus.COMPLETED
    db.session.commit()
    return jsonify(session.to_dict())
