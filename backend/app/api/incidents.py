"""Chức năng 5: nhân viên chuyển các trường hợp ngoại lệ cho quản lý xác minh."""
from flask import Blueprint, g, jsonify, request
from sqlalchemy import select

from ..extensions import db
from ..models import Incident, IncidentStatus, IncidentType, ParkingSession, Role, utcnow
from ..utils import APIError, auth_required, get_json, paginate, require_str

bp = Blueprint("incidents", __name__, url_prefix="/api/incidents")


@bp.get("")
@auth_required(*Role.ALL)
def list_incidents():
    query = select(Incident).order_by(Incident.created_at.desc())
    # Nhân viên chỉ xem các yêu cầu do mình tạo
    if g.current_user.role != Role.MANAGER:
        query = query.where(Incident.created_by == g.current_user.id)
    if status := request.args.get("status"):
        query = query.where(Incident.status == status)
    return jsonify(paginate(query, request.args))


@bp.post("")
@auth_required(*Role.ALL)
def create_incident():
    data = get_json()
    incident_type = data.get("type", IncidentType.OTHER)
    if incident_type not in IncidentType.ALL:
        raise APIError("INVALID_DATA", "Loại ngoại lệ không hợp lệ", details={"field": "type"})

    session_id = data.get("session_id")
    if session_id is not None and db.session.get(ParkingSession, session_id) is None:
        raise APIError("SESSION_NOT_FOUND", "Không tìm thấy lượt gửi", 404)

    incident = Incident(
        type=incident_type,
        plate_number=require_str(data, "plate_number", "Biển số", 20, required=False),
        session_id=session_id,
        description=require_str(data, "description", "Mô tả", 2000),
        created_by=g.current_user.id,
    )
    db.session.add(incident)
    db.session.commit()
    return jsonify(incident.to_dict()), 201


@bp.post("/<int:incident_id>/resolve")
@auth_required(Role.MANAGER)
def resolve_incident(incident_id):
    incident = db.session.get(Incident, incident_id)
    if incident is None:
        raise APIError("NOT_FOUND", "Không tìm thấy yêu cầu xác minh", 404)
    if incident.status == IncidentStatus.RESOLVED:
        raise APIError("INVALID_STATE", "Yêu cầu đã được xử lý", 409)
    data = get_json()
    incident.resolution_note = require_str(data, "resolution_note", "Kết quả xử lý", 2000)
    incident.status = IncidentStatus.RESOLVED
    incident.resolved_by = g.current_user.id
    incident.resolved_at = utcnow()
    db.session.commit()
    return jsonify(incident.to_dict())
