"""Chức năng 10-11: thống kê lượt xe, sức chứa và doanh thu; cùng dữ liệu trang tổng quan."""
from datetime import datetime, time

from flask import Blueprint, current_app, g, jsonify, request
from sqlalchemy import func, select

from ..extensions import db
from ..models import Incident, IncidentStatus, ParkingSession, Payment, Role, SessionStatus, VehicleType
from ..services import capacity_overview
from ..utils import app_tz, auth_required, parse_date_range

bp = Blueprint("reports", __name__, url_prefix="/api")


def _local_date(column):
    return func.date(func.timezone(current_app.config["APP_TIMEZONE"], column))


def _type_names():
    return {vt.id: vt.name for vt in db.session.scalars(select(VehicleType))}


def _count_by(column, start, end, type_id, extra_filter=None):
    """Đếm lượt gửi theo (loại xe, ngày địa phương) với `column` nằm trong [start, end)."""
    day = _local_date(column).label("day")
    query = (
        select(ParkingSession.vehicle_type_id, day, func.count())
        .where(column >= start, column < end)
        .group_by(ParkingSession.vehicle_type_id, day)
    )
    if extra_filter is not None:
        query = query.where(extra_filter)
    if type_id:
        query = query.where(ParkingSession.vehicle_type_id == type_id)
    return db.session.execute(query).all()


@bp.get("/reports/traffic")
@auth_required(Role.MANAGER)
def traffic_report():
    start, end, from_date, to_date = parse_date_range(request.args)
    type_id = request.args.get("vehicle_type_id", type=int)
    names = _type_names()

    ins = _count_by(ParkingSession.check_in_at, start, end, type_id)
    outs = _count_by(
        ParkingSession.check_out_at, start, end, type_id, ParkingSession.status == SessionStatus.COMPLETED
    )

    by_type, by_day = {}, {}
    for rows, key in ((ins, "check_ins"), (outs, "check_outs")):
        for vt_id, day, count in rows:
            t = by_type.setdefault(vt_id, {"vehicle_type_id": vt_id, "vehicle_type_name": names.get(vt_id),
                                           "check_ins": 0, "check_outs": 0})
            t[key] += count
            d = by_day.setdefault(day.isoformat(), {"date": day.isoformat(), "check_ins": 0, "check_outs": 0})
            d[key] += count

    capacity = capacity_overview()
    if type_id:
        capacity["items"] = [i for i in capacity["items"] if i["id"] == type_id]

    return jsonify({
        "from": from_date.isoformat(),
        "to": to_date.isoformat(),
        "total_check_ins": sum(t["check_ins"] for t in by_type.values()),
        "total_check_outs": sum(t["check_outs"] for t in by_type.values()),
        "by_vehicle_type": sorted(by_type.values(), key=lambda x: x["vehicle_type_id"]),
        "by_day": sorted(by_day.values(), key=lambda x: x["date"]),
        "current_capacity": capacity,
    })


@bp.get("/reports/revenue")
@auth_required(Role.MANAGER)
def revenue_report():
    start, end, from_date, to_date = parse_date_range(request.args)
    type_id = request.args.get("vehicle_type_id", type=int)
    names = _type_names()

    day = _local_date(Payment.paid_at).label("day")
    query = (
        select(ParkingSession.vehicle_type_id, day, Payment.method, func.count(), func.sum(Payment.amount))
        .join(ParkingSession, Payment.session_id == ParkingSession.id)
        .where(Payment.paid_at >= start, Payment.paid_at < end)
        .group_by(ParkingSession.vehicle_type_id, day, Payment.method)
    )
    if type_id:
        query = query.where(ParkingSession.vehicle_type_id == type_id)

    by_type, by_day, by_method = {}, {}, {}
    for vt_id, d, method, count, amount in db.session.execute(query).all():
        amount = int(amount or 0)
        t = by_type.setdefault(vt_id, {"vehicle_type_id": vt_id, "vehicle_type_name": names.get(vt_id),
                                       "transactions": 0, "amount": 0})
        t["transactions"] += count
        t["amount"] += amount
        dd = by_day.setdefault(d.isoformat(), {"date": d.isoformat(), "transactions": 0, "amount": 0})
        dd["transactions"] += count
        dd["amount"] += amount
        m = by_method.setdefault(method, {"method": method, "transactions": 0, "amount": 0})
        m["transactions"] += count
        m["amount"] += amount

    return jsonify({
        "from": from_date.isoformat(),
        "to": to_date.isoformat(),
        "total_amount": sum(t["amount"] for t in by_type.values()),
        "total_transactions": sum(t["transactions"] for t in by_type.values()),
        "by_vehicle_type": sorted(by_type.values(), key=lambda x: x["vehicle_type_id"]),
        "by_day": sorted(by_day.values(), key=lambda x: x["date"]),
        "by_method": sorted(by_method.values(), key=lambda x: x["method"]),
    })


@bp.get("/dashboard")
@auth_required(*Role.ALL)
def dashboard():
    tz = app_tz()
    today_start = datetime.combine(datetime.now(tz).date(), time.min, tzinfo=tz)

    check_ins_today = db.session.scalar(
        select(func.count()).select_from(ParkingSession).where(ParkingSession.check_in_at >= today_start)
    )
    check_outs_today = db.session.scalar(
        select(func.count()).select_from(ParkingSession).where(
            ParkingSession.status == SessionStatus.COMPLETED, ParkingSession.check_out_at >= today_start
        )
    )
    pending_payment = db.session.scalar(
        select(func.count()).select_from(ParkingSession).where(
            ParkingSession.status == SessionStatus.PENDING_PAYMENT
        )
    )
    incidents_query = select(func.count()).select_from(Incident).where(Incident.status == IncidentStatus.OPEN)
    if g.current_user.role != Role.MANAGER:
        incidents_query = incidents_query.where(Incident.created_by == g.current_user.id)

    result = {
        "capacity": capacity_overview(),
        "check_ins_today": check_ins_today,
        "check_outs_today": check_outs_today,
        "pending_payment": pending_payment,
        "open_incidents": db.session.scalar(incidents_query),
    }
    if g.current_user.role == Role.MANAGER:
        result["revenue_today"] = int(
            db.session.scalar(select(func.coalesce(func.sum(Payment.amount), 0)).where(Payment.paid_at >= today_start))
        )
    return jsonify(result)
