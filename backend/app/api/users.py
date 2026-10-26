"""Quản lý tài khoản người dùng (chỉ người quản lý)."""
import re

from flask import Blueprint, g, jsonify, request
from sqlalchemy import or_, select

from ..extensions import db
from ..models import Role, User
from ..utils import APIError, auth_required, get_json, paginate, require_str

bp = Blueprint("users", __name__, url_prefix="/api/users")

USERNAME_PATTERN = re.compile(r"^[a-zA-Z0-9_.]{3,50}$")


def _get_user(user_id):
    user = db.session.get(User, user_id)
    if user is None:
        raise APIError("NOT_FOUND", "Không tìm thấy tài khoản", 404)
    return user


def _validate_role(role):
    if role not in Role.ALL:
        raise APIError("INVALID_DATA", "Vai trò không hợp lệ", details={"field": "role"})
    return role


def _validate_password(password):
    if len(password) < 6:
        raise APIError("INVALID_DATA", "Mật khẩu tối thiểu 6 ký tự", details={"field": "password"})
    return password


@bp.get("")
@auth_required(Role.MANAGER)
def list_users():
    query = select(User).order_by(User.id)
    if q := request.args.get("q", "").strip():
        query = query.where(or_(User.username.ilike(f"%{q}%"), User.full_name.ilike(f"%{q}%")))
    if role := request.args.get("role"):
        query = query.where(User.role == role)
    return jsonify(paginate(query, request.args))


@bp.post("")
@auth_required(Role.MANAGER)
def create_user():
    data = get_json()
    username = require_str(data, "username", "Tên đăng nhập", 50)
    if not USERNAME_PATTERN.match(username):
        raise APIError(
            "INVALID_DATA",
            "Tên đăng nhập 3-50 ký tự, chỉ gồm chữ, số, dấu chấm và gạch dưới",
            details={"field": "username"},
        )
    if db.session.scalar(select(User).where(User.username == username)):
        raise APIError("DUPLICATE", "Tên đăng nhập đã tồn tại", 409, details={"field": "username"})

    user = User(
        username=username,
        full_name=require_str(data, "full_name", "Họ tên", 100),
        role=_validate_role(data.get("role", Role.STAFF)),
        is_active=bool(data.get("is_active", True)),
    )
    user.set_password(_validate_password(require_str(data, "password", "Mật khẩu", 128)))
    db.session.add(user)
    db.session.commit()
    return jsonify(user.to_dict()), 201


@bp.put("/<int:user_id>")
@auth_required(Role.MANAGER)
def update_user(user_id):
    user = _get_user(user_id)
    data = get_json()
    is_self = user.id == g.current_user.id

    if "full_name" in data:
        user.full_name = require_str(data, "full_name", "Họ tên", 100)
    if "role" in data:
        role = _validate_role(data["role"])
        if is_self and role != Role.MANAGER:
            raise APIError("FORBIDDEN", "Không thể tự hạ quyền tài khoản của chính mình", 403)
        user.role = role
    if "is_active" in data:
        if is_self and not data["is_active"]:
            raise APIError("FORBIDDEN", "Không thể tự khoá tài khoản của chính mình", 403)
        user.is_active = bool(data["is_active"])

    db.session.commit()
    return jsonify(user.to_dict())


@bp.post("/<int:user_id>/reset-password")
@auth_required(Role.MANAGER)
def reset_password(user_id):
    user = _get_user(user_id)
    data = get_json()
    user.set_password(_validate_password(require_str(data, "password", "Mật khẩu mới", 128)))
    db.session.commit()
    return jsonify({"message": "Đặt lại mật khẩu thành công"})
