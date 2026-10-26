import pytest

from app import create_app
from app.config import TestConfig
from app.extensions import db
from app.models import PriceRule, PricingMethod, Role, User, VehicleType


@pytest.fixture()
def app():
    app = create_app(TestConfig)
    with app.app_context():
        db.drop_all()
        db.create_all()
        manager = User(username="manager", full_name="Quản lý", role=Role.MANAGER)
        manager.set_password("secret1")
        staff = User(username="staff", full_name="Nhân viên", role=Role.STAFF)
        staff.set_password("secret1")
        moto = VehicleType(code="MOTORBIKE", name="Xe máy", capacity=2)
        car = VehicleType(code="CAR", name="Ô tô", capacity=1)
        db.session.add_all([manager, staff, moto, car])
        db.session.flush()
        db.session.add_all([
            PriceRule(vehicle_type_id=moto.id, pricing_method=PricingMethod.PER_TURN, unit_price=5000),
            PriceRule(vehicle_type_id=car.id, pricing_method=PricingMethod.PER_HOUR, unit_price=20000),
        ])
        db.session.commit()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


def _login(client, username):
    res = client.post("/api/auth/login", json={"username": username, "password": "secret1"})
    assert res.status_code == 200, res.get_json()
    return {"Authorization": f"Bearer {res.get_json()['access_token']}"}


@pytest.fixture()
def staff_headers(client):
    return _login(client, "staff")


@pytest.fixture()
def manager_headers(client):
    return _login(client, "manager")


@pytest.fixture()
def type_ids(app):
    with app.app_context():
        return {vt.code: vt.id for vt in db.session.scalars(db.select(VehicleType))}
