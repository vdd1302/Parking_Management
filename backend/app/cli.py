import click
from sqlalchemy import select

from .extensions import db
from .models import ParkingLot, PriceRule, PricingMethod, Role, User, VehicleType

DEFAULT_TYPES = [
    # code, name, capacity, pricing method, unit price (VND)
    ("MOTORBIKE", "Xe máy", 200, PricingMethod.PER_TURN, 5000),
    ("CAR", "Ô tô", 50, PricingMethod.PER_HOUR, 25000),
    ("BICYCLE", "Xe đạp điện", 50, PricingMethod.PER_TURN, 3000),
]


def register_cli(app):
    @app.cli.command("seed")
    @click.option("--admin-password", default="admin123", show_default=True)
    @click.option("--staff-password", default="staff123", show_default=True)
    def seed(admin_password, staff_password):
        """Tạo dữ liệu khởi tạo: tài khoản mẫu, thông tin bãi, loại xe và bảng giá."""
        accounts = [
            ("admin", "Quản lý bãi xe", Role.MANAGER, admin_password),
            ("staff", "Nhân viên bãi xe", Role.STAFF, staff_password),
        ]
        for username, full_name, role, password in accounts:
            if not db.session.scalar(select(User).where(User.username == username)):
                user = User(username=username, full_name=full_name, role=role)
                user.set_password(password)
                db.session.add(user)
                click.echo(f"Tạo tài khoản {username} ({role})")

        if not db.session.scalar(select(ParkingLot)):
            db.session.add(ParkingLot(name="Bãi đỗ xe trung tâm", address="Số 1 Đường ABC, Hà Nội",
                                      phone="0241234567", opening_hours="06:00 - 23:00"))

        for code, name, capacity, method, price in DEFAULT_TYPES:
            vt = db.session.scalar(select(VehicleType).where(VehicleType.code == code))
            if vt is None:
                vt = VehicleType(code=code, name=name, capacity=capacity)
                db.session.add(vt)
                db.session.flush()
                db.session.add(PriceRule(vehicle_type_id=vt.id, pricing_method=method, unit_price=price,
                                         note="Giá khởi tạo"))
                click.echo(f"Tạo loại xe {name} - sức chứa {capacity}")

        db.session.commit()
        click.echo("Seed hoàn tất.")
