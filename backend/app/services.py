"""Nghiệp vụ dùng chung: sức chứa, bảng giá và tính phí."""
import math

from sqlalchemy import func, select

from .extensions import db
from .models import ParkingSession, PriceRule, PricingMethod, SessionStatus, VehicleType, utcnow


def occupied_counts():
    """{vehicle_type_id: số xe đang chiếm chỗ}."""
    rows = db.session.execute(
        select(ParkingSession.vehicle_type_id, func.count())
        .where(ParkingSession.status.in_(SessionStatus.OCCUPYING))
        .group_by(ParkingSession.vehicle_type_id)
    ).all()
    return {type_id: count for type_id, count in rows}


def occupied_count(vehicle_type_id):
    return db.session.scalar(
        select(func.count())
        .select_from(ParkingSession)
        .where(
            ParkingSession.vehicle_type_id == vehicle_type_id,
            ParkingSession.status.in_(SessionStatus.OCCUPYING),
        )
    )


def capacity_overview(include_inactive=False):
    query = select(VehicleType).order_by(VehicleType.id)
    if not include_inactive:
        query = query.where(VehicleType.is_active.is_(True))
    counts = occupied_counts()
    items = []
    for vt in db.session.scalars(query):
        occupied = counts.get(vt.id, 0)
        items.append(
            {
                **vt.to_dict(),
                "occupied": occupied,
                "available": max(vt.capacity - occupied, 0),
                "is_full": occupied >= vt.capacity,
            }
        )
    return {
        "items": items,
        "total_capacity": sum(i["capacity"] for i in items),
        "total_occupied": sum(i["occupied"] for i in items),
        "total_available": sum(i["available"] for i in items),
    }


def lock_vehicle_type(vehicle_type_id):
    """Khoá dòng loại xe (SELECT ... FOR UPDATE) để tuần tự hoá các thao tác thay đổi
    số chỗ của cùng một loại xe, tránh vượt sức chứa khi nhiều nhân viên thao tác cùng lúc."""
    return db.session.scalar(
        select(VehicleType).where(VehicleType.id == vehicle_type_id).with_for_update()
    )


def current_price_rule(vehicle_type_id, at=None):
    """Bảng giá đang áp dụng tại thời điểm `at`: bản ghi có effective_from mới nhất <= at."""
    at = at or utcnow()
    return db.session.scalar(
        select(PriceRule)
        .where(PriceRule.vehicle_type_id == vehicle_type_id, PriceRule.effective_from <= at)
        .order_by(PriceRule.effective_from.desc(), PriceRule.id.desc())
        .limit(1)
    )


def duration_minutes(check_in_at, check_out_at):
    seconds = max((check_out_at - check_in_at).total_seconds(), 0)
    return math.ceil(seconds / 60)


def calculate_fee(rule, minutes):
    if rule.pricing_method == PricingMethod.PER_TURN:
        return rule.unit_price
    if rule.pricing_method == PricingMethod.PER_HOUR:
        return max(1, math.ceil(minutes / 60)) * rule.unit_price
    if rule.pricing_method == PricingMethod.PER_DAY:
        return max(1, math.ceil(minutes / 1440)) * rule.unit_price
    raise ValueError(f"Unknown pricing method: {rule.pricing_method}")
