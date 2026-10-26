from datetime import datetime, timezone

from werkzeug.security import check_password_hash, generate_password_hash

from .extensions import db


def utcnow():
    return datetime.now(timezone.utc)


class Role:
    MANAGER = "MANAGER"
    STAFF = "STAFF"
    ALL = (MANAGER, STAFF)


class SessionStatus:
    ACTIVE = "ACTIVE"  # xe đang trong bãi
    PENDING_PAYMENT = "PENDING_PAYMENT"  # đã xác định giờ ra + phí, chờ xác nhận thu tiền
    COMPLETED = "COMPLETED"  # đã thanh toán, lượt gửi kết thúc
    OCCUPYING = (ACTIVE, PENDING_PAYMENT)  # các trạng thái còn chiếm chỗ
    ALL = (ACTIVE, PENDING_PAYMENT, COMPLETED)


class PricingMethod:
    PER_TURN = "PER_TURN"  # đồng giá mỗi lượt
    PER_HOUR = "PER_HOUR"  # theo giờ, làm tròn lên
    PER_DAY = "PER_DAY"  # theo ngày (24h), làm tròn lên
    ALL = (PER_TURN, PER_HOUR, PER_DAY)


class PaymentMethod:
    CASH = "CASH"
    TRANSFER = "TRANSFER"
    ALL = (CASH, TRANSFER)


class IncidentType:
    LOT_FULL = "LOT_FULL"
    DUPLICATE_ACTIVE = "DUPLICATE_ACTIVE"
    SESSION_NOT_FOUND = "SESSION_NOT_FOUND"
    INFO_MISMATCH = "INFO_MISMATCH"
    OTHER = "OTHER"
    ALL = (LOT_FULL, DUPLICATE_ACTIVE, SESSION_NOT_FOUND, INFO_MISMATCH, OTHER)


class IncidentStatus:
    OPEN = "OPEN"
    RESOLVED = "RESOLVED"


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    full_name = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(20), nullable=False, default=Role.STAFF)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    __table_args__ = (db.CheckConstraint("role IN ('MANAGER', 'STAFF')", name="ck_users_role"),)

    def set_password(self, raw):
        self.password_hash = generate_password_hash(raw)

    def check_password(self, raw):
        return check_password_hash(self.password_hash, raw)

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "full_name": self.full_name,
            "role": self.role,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ParkingLot(db.Model):
    """Thông tin cơ bản của bãi xe (hệ thống quản lý một bãi)."""

    __tablename__ = "parking_lot"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    address = db.Column(db.String(255))
    phone = db.Column(db.String(20))
    opening_hours = db.Column(db.String(100))
    description = db.Column(db.Text)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "address": self.address,
            "phone": self.phone,
            "opening_hours": self.opening_hours,
            "description": self.description,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class VehicleType(db.Model):
    __tablename__ = "vehicle_types"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(30), unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    capacity = db.Column(db.Integer, nullable=False, default=0)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    __table_args__ = (db.CheckConstraint("capacity >= 0", name="ck_vehicle_types_capacity"),)

    def to_dict(self):
        return {
            "id": self.id,
            "code": self.code,
            "name": self.name,
            "capacity": self.capacity,
            "is_active": self.is_active,
        }


class PriceRule(db.Model):
    """Bảng giá có phiên bản: mỗi lần thay đổi giá tạo một bản ghi mới với
    effective_from; bản ghi đã áp dụng không bị sửa, nên các lượt gửi cũ giữ nguyên
    giá đã dùng."""

    __tablename__ = "price_rules"

    id = db.Column(db.Integer, primary_key=True)
    vehicle_type_id = db.Column(db.Integer, db.ForeignKey("vehicle_types.id"), nullable=False, index=True)
    pricing_method = db.Column(db.String(20), nullable=False)
    unit_price = db.Column(db.BigInteger, nullable=False)
    effective_from = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    note = db.Column(db.String(255))
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    vehicle_type = db.relationship("VehicleType")
    creator = db.relationship("User")

    __table_args__ = (
        db.CheckConstraint("unit_price >= 0", name="ck_price_rules_unit_price"),
        db.CheckConstraint(
            "pricing_method IN ('PER_TURN', 'PER_HOUR', 'PER_DAY')", name="ck_price_rules_method"
        ),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "vehicle_type_id": self.vehicle_type_id,
            "vehicle_type_name": self.vehicle_type.name if self.vehicle_type else None,
            "pricing_method": self.pricing_method,
            "unit_price": self.unit_price,
            "effective_from": self.effective_from.isoformat(),
            "note": self.note,
            "created_by": self.creator.full_name if self.creator else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ParkingSession(db.Model):
    """Một lượt gửi xe."""

    __tablename__ = "parking_sessions"

    id = db.Column(db.Integer, primary_key=True)
    # Gán ngay sau khi flush (dựa trên id) nên cho phép NULL trong lúc insert
    code = db.Column(db.String(20), unique=True)
    plate_number = db.Column(db.String(20), nullable=False)  # biển số hiển thị
    plate_key = db.Column(db.String(20), nullable=False, index=True)  # biển số chuẩn hoá để so khớp
    vehicle_type_id = db.Column(db.Integer, db.ForeignKey("vehicle_types.id"), nullable=False, index=True)
    status = db.Column(db.String(20), nullable=False, default=SessionStatus.ACTIVE, index=True)
    check_in_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, index=True)
    check_out_at = db.Column(db.DateTime(timezone=True), index=True)
    duration_minutes = db.Column(db.Integer)
    fee_amount = db.Column(db.BigInteger)
    price_rule_id = db.Column(db.Integer, db.ForeignKey("price_rules.id"))
    checked_in_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    checked_out_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    note = db.Column(db.String(255))

    vehicle_type = db.relationship("VehicleType")
    price_rule = db.relationship("PriceRule")
    check_in_user = db.relationship("User", foreign_keys=[checked_in_by])
    check_out_user = db.relationship("User", foreign_keys=[checked_out_by])
    payment = db.relationship("Payment", back_populates="session", uselist=False)

    __table_args__ = (
        db.CheckConstraint(
            "status IN ('ACTIVE', 'PENDING_PAYMENT', 'COMPLETED')", name="ck_parking_sessions_status"
        ),
        # Mỗi biển số chỉ có tối đa một lượt gửi đang hoạt động
        db.Index(
            "uq_parking_sessions_active_plate",
            "plate_key",
            unique=True,
            postgresql_where=db.text("status IN ('ACTIVE', 'PENDING_PAYMENT')"),
        ),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "code": self.code,
            "plate_number": self.plate_number,
            "vehicle_type_id": self.vehicle_type_id,
            "vehicle_type_name": self.vehicle_type.name if self.vehicle_type else None,
            "status": self.status,
            "check_in_at": self.check_in_at.isoformat() if self.check_in_at else None,
            "check_out_at": self.check_out_at.isoformat() if self.check_out_at else None,
            "duration_minutes": self.duration_minutes,
            "fee_amount": self.fee_amount,
            "price_rule": self.price_rule.to_dict() if self.price_rule else None,
            "checked_in_by": self.check_in_user.full_name if self.check_in_user else None,
            "checked_out_by": self.check_out_user.full_name if self.check_out_user else None,
            "note": self.note,
            "payment": self.payment.to_dict() if self.payment else None,
        }


class Payment(db.Model):
    __tablename__ = "payments"

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey("parking_sessions.id"), unique=True, nullable=False)
    amount = db.Column(db.BigInteger, nullable=False)
    method = db.Column(db.String(20), nullable=False, default=PaymentMethod.CASH)
    paid_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, index=True)
    received_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    note = db.Column(db.String(255))

    session = db.relationship("ParkingSession", back_populates="payment")
    receiver = db.relationship("User")

    __table_args__ = (
        db.CheckConstraint("amount >= 0", name="ck_payments_amount"),
        db.CheckConstraint("method IN ('CASH', 'TRANSFER')", name="ck_payments_method"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "session_id": self.session_id,
            "amount": self.amount,
            "method": self.method,
            "paid_at": self.paid_at.isoformat(),
            "received_by": self.receiver.full_name if self.receiver else None,
            "note": self.note,
        }


class Incident(db.Model):
    """Ngoại lệ được nhân viên chuyển cho quản lý xác minh."""

    __tablename__ = "incidents"

    id = db.Column(db.Integer, primary_key=True)
    type = db.Column(db.String(30), nullable=False)
    status = db.Column(db.String(20), nullable=False, default=IncidentStatus.OPEN, index=True)
    plate_number = db.Column(db.String(20))
    session_id = db.Column(db.Integer, db.ForeignKey("parking_sessions.id"))
    description = db.Column(db.Text, nullable=False)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    resolved_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    resolved_at = db.Column(db.DateTime(timezone=True))
    resolution_note = db.Column(db.Text)

    session = db.relationship("ParkingSession")
    creator = db.relationship("User", foreign_keys=[created_by])
    resolver = db.relationship("User", foreign_keys=[resolved_by])

    __table_args__ = (
        db.CheckConstraint(
            "type IN ('LOT_FULL', 'DUPLICATE_ACTIVE', 'SESSION_NOT_FOUND', 'INFO_MISMATCH', 'OTHER')",
            name="ck_incidents_type",
        ),
        db.CheckConstraint("status IN ('OPEN', 'RESOLVED')", name="ck_incidents_status"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "type": self.type,
            "status": self.status,
            "plate_number": self.plate_number,
            "session_id": self.session_id,
            "session_code": self.session.code if self.session else None,
            "description": self.description,
            "created_by": self.creator.full_name if self.creator else None,
            "created_at": self.created_at.isoformat(),
            "resolved_by": self.resolver.full_name if self.resolver else None,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "resolution_note": self.resolution_note,
        }
