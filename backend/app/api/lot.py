"""Chức năng 6: thông tin bãi xe, loại phương tiện và sức chứa."""
import re

from flask import Blueprint, jsonify, request
from sqlalchemy import select

from ..extensions import db
from ..models import ParkingLot, Role, VehicleType
from ..services import capacity_overview, lock_vehicle_type, occupied_count
from ..utils import APIError, auth_required, get_json, require_int, require_str

bp = Blueprint("lot", __name__, url_prefix="/api")

CODE_PATTERN = re.compile(r"^[A-Z0-9_]{2,30}$")


def _get_lot():
    lot = db.session.scalar(select(ParkingLot).limit(1))
    if lot is None:
        lot = ParkingLot(name="Bãi xe")
        db.session.add(lot)
        db.session.flush()
    return lot


@bp.get("/lot")
@auth_required()
def get_lot():
    lot = _get_lot()
    db.session.commit()
    return jsonify(lot.to_dict())


@bp.put("/lot")
@auth_required(Role.MANAGER)
def update_lot():
    data = get_json()
    lot = _get_lot()
    lot.name = require_str(data, "name", "Tên bãi xe", 150)
    lot.address = require_str(data, "address", "Địa chỉ", 255, required=False)
    phone = require_str(data, "phone", "Số điện thoại", 20, required=False)
    if phone and not re.fullmatch(r"[0-9+\-. ]{8,20}", phone):
        raise APIError("INVALID_DATA", "Số điện thoại không hợp lệ", details={"field": "phone"})
    lot.phone = phone
    lot.opening_hours = require_str(data, "opening_hours", "Giờ hoạt động", 100, required=False)
    lot.description = require_str(data, "description", "Mô tả", 2000, required=False)
    db.session.commit()
    return jsonify(lot.to_dict())


@bp.get("/capacity")
@auth_required()
def get_capacity():
    return jsonify(capacity_overview())


@bp.get("/vehicle-types")
@auth_required()
def list_vehicle_types():
    include_inactive = request.args.get("include_inactive") == "1"
    return jsonify(capacity_overview(include_inactive=include_inactive)["items"])


@bp.post("/vehicle-types")
@auth_required(Role.MANAGER)
def create_vehicle_type():
    data = get_json()
    code = require_str(data, "code", "Mã loại xe", 30).upper()
    if not CODE_PATTERN.match(code):
        raise APIError("INVALID_DATA", "Mã loại xe chỉ gồm chữ in hoa, số và '_'", details={"field": "code"})
    if db.session.scalar(select(VehicleType).where(VehicleType.code == code)):
        raise APIError("DUPLICATE", "Mã loại xe đã tồn tại", 409, details={"field": "code"})
    vt = VehicleType(
        code=code,
        name=require_str(data, "name", "Tên loại xe", 100),
        capacity=require_int(data, "capacity", "Sức chứa", min_value=0),
        is_active=bool(data.get("is_active", True)),
    )
    db.session.add(vt)
    db.session.commit()
    return jsonify(vt.to_dict()), 201


@bp.put("/vehicle-types/<int:type_id>")
@auth_required(Role.MANAGER)
def update_vehicle_type(type_id):
    data = get_json()
    vt = lock_vehicle_type(type_id)
    if vt is None:
        raise APIError("NOT_FOUND", "Không tìm thấy loại phương tiện", 404)

    occupied = occupied_count(vt.id)
    if "capacity" in data:
        capacity = require_int(data, "capacity", "Sức chứa", min_value=0)
        if capacity < occupied:
            raise APIError(
                "CAPACITY_BELOW_OCCUPANCY",
                f"Sức chứa mới ({capacity}) không được nhỏ hơn số xe đang gửi ({occupied})",
                details={"field": "capacity", "occupied": occupied},
            )
        vt.capacity = capacity
    if "name" in data:
        vt.name = require_str(data, "name", "Tên loại xe", 100)
    if "is_active" in data:
        if not data["is_active"] and occupied > 0:
            raise APIError(
                "VEHICLE_TYPE_IN_USE",
                f"Không thể ngừng sử dụng loại xe khi còn {occupied} xe đang gửi",
                details={"occupied": occupied},
            )
        vt.is_active = bool(data["is_active"])

    db.session.commit()
    return jsonify({**vt.to_dict(), "occupied": occupied})
