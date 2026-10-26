from flask import Blueprint, g, jsonify
from flask_jwt_extended import create_access_token
from sqlalchemy import select

from ..extensions import db
from ..models import User
from ..utils import APIError, auth_required, get_json, require_str

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@bp.post("/login")
def login():
    data = get_json()
    username = require_str(data, "username", "Tên đăng nhập", 50)
    password = require_str(data, "password", "Mật khẩu", 128)

    user = db.session.scalar(select(User).where(User.username == username))
    if user is None or not user.check_password(password):
        raise APIError("INVALID_CREDENTIALS", "Tên đăng nhập hoặc mật khẩu không đúng", 401)
    if not user.is_active:
        raise APIError("ACCOUNT_DISABLED", "Tài khoản đã bị khoá, vui lòng liên hệ quản lý", 403)

    token = create_access_token(identity=str(user.id), additional_claims={"role": user.role})
    return jsonify({"access_token": token, "user": user.to_dict()})


@bp.get("/me")
@auth_required()
def me():
    return jsonify(g.current_user.to_dict())


@bp.post("/change-password")
@auth_required()
def change_password():
    data = get_json()
    current = require_str(data, "current_password", "Mật khẩu hiện tại", 128)
    new = require_str(data, "new_password", "Mật khẩu mới", 128)
    if not g.current_user.check_password(current):
        raise APIError("INVALID_CREDENTIALS", "Mật khẩu hiện tại không đúng")
    if len(new) < 6:
        raise APIError("INVALID_DATA", "Mật khẩu mới tối thiểu 6 ký tự", details={"field": "new_password"})
    g.current_user.set_password(new)
    db.session.commit()
    return jsonify({"message": "Đổi mật khẩu thành công"})
