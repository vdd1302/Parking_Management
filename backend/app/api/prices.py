"""Chức năng 7: bảng giá dịch vụ (có phiên bản)."""
from datetime import datetime

from flask import Blueprint, g, jsonify, request
from sqlalchemy import select

from ..extensions import db
from ..models import ParkingSession, PriceRule, PricingMethod, Role, VehicleType, utcnow
from ..services import current_price_rule
from ..utils import APIError, app_tz, auth_required, get_json, require_int, require_str

bp = Blueprint("prices", __name__, url_prefix="/api/prices")


@bp.get("")
@auth_required()
def list_prices():
    """Toàn bộ lịch sử bảng giá, mới nhất trước; mỗi bản ghi kèm cờ đang áp dụng / sắp áp dụng."""
    query = select(PriceRule).order_by(PriceRule.vehicle_type_id, PriceRule.effective_from.desc())
    if type_id := request.args.get("vehicle_type_id", type=int):
        query = query.where(PriceRule.vehicle_type_id == type_id)
    now = utcnow()
    current_ids = set()
    for vt_id in db.session.scalars(select(VehicleType.id)):
        rule = current_price_rule(vt_id, now)
        if rule:
            current_ids.add(rule.id)
    items = []
    for rule in db.session.scalars(query):
        state = "CURRENT" if rule.id in current_ids else ("SCHEDULED" if rule.effective_from > now else "EXPIRED")
        items.append({**rule.to_dict(), "state": state})
    return jsonify(items)


@bp.get("/current")
@auth_required()
def current_prices():
    items = []
    for vt in db.session.scalars(select(VehicleType).where(VehicleType.is_active.is_(True)).order_by(VehicleType.id)):
        rule = current_price_rule(vt.id)
        items.append({"vehicle_type": vt.to_dict(), "price_rule": rule.to_dict() if rule else None})
    return jsonify(items)


@bp.post("")
@auth_required(Role.MANAGER)
def create_price():
    """Thiết lập / cập nhật giá = tạo phiên bản mới. Giá cũ được giữ nguyên để
    đối chiếu các lượt gửi đã tính phí trước đó."""
    data = get_json()
    vehicle_type_id = require_int(data, "vehicle_type_id", "Loại phương tiện")
    if db.session.get(VehicleType, vehicle_type_id) is None:
        raise APIError("NOT_FOUND", "Không tìm thấy loại phương tiện", 404)

    method = data.get("pricing_method")
    if method not in PricingMethod.ALL:
        raise APIError("INVALID_DATA", "Cách tính phí không hợp lệ", details={"field": "pricing_method"})

    unit_price = require_int(data, "unit_price", "Đơn giá", min_value=0)
    if unit_price > 100_000_000:
        raise APIError("INVALID_DATA", "Đơn giá quá lớn", details={"field": "unit_price"})

    now = utcnow()
    effective_from = now
    if data.get("effective_from"):
        try:
            effective_from = datetime.fromisoformat(str(data["effective_from"]))
        except ValueError:
            raise APIError("INVALID_DATA", "Thời điểm áp dụng không hợp lệ", details={"field": "effective_from"})
        if effective_from.tzinfo is None:
            effective_from = effective_from.replace(tzinfo=app_tz())
        # Không cho phép áp dụng giá hồi tố, tránh làm sai lệch lịch sử
        if effective_from < now:
            effective_from = now

    rule = PriceRule(
        vehicle_type_id=vehicle_type_id,
        pricing_method=method,
        unit_price=unit_price,
        effective_from=effective_from,
        note=require_str(data, "note", "Ghi chú", 255, required=False),
        created_by=g.current_user.id,
    )
    db.session.add(rule)
    db.session.commit()
    return jsonify(rule.to_dict()), 201


@bp.delete("/<int:rule_id>")
@auth_required(Role.MANAGER)
def delete_price(rule_id):
    """Chỉ được huỷ bảng giá chưa đến thời điểm áp dụng và chưa được dùng để tính phí."""
    rule = db.session.get(PriceRule, rule_id)
    if rule is None:
        raise APIError("NOT_FOUND", "Không tìm thấy bảng giá", 404)
    used = db.session.scalar(select(ParkingSession.id).where(ParkingSession.price_rule_id == rule.id).limit(1))
    if rule.effective_from <= utcnow() or used:
        raise APIError("PRICE_RULE_LOCKED", "Bảng giá đã áp dụng, không thể xoá. Hãy tạo bảng giá mới.", 409)
    db.session.delete(rule)
    db.session.commit()
    return jsonify({"message": "Đã huỷ bảng giá"})
