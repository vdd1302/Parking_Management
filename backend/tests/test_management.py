from datetime import datetime, timedelta, timezone

from app.services import calculate_fee
from app.models import PriceRule, PricingMethod


def test_fee_calculation():
    hourly = PriceRule(pricing_method=PricingMethod.PER_HOUR, unit_price=10000)
    assert calculate_fee(hourly, 0) == 10000
    assert calculate_fee(hourly, 60) == 10000
    assert calculate_fee(hourly, 61) == 20000
    daily = PriceRule(pricing_method=PricingMethod.PER_DAY, unit_price=50000)
    assert calculate_fee(daily, 1441) == 100000
    turn = PriceRule(pricing_method=PricingMethod.PER_TURN, unit_price=5000)
    assert calculate_fee(turn, 5000) == 5000


def test_capacity_cannot_go_below_occupancy(client, staff_headers, manager_headers, type_ids):
    client.post("/api/sessions/check-in", json={"plate_number": "29A12345", "vehicle_type_id": type_ids["MOTORBIKE"]},
                headers=staff_headers)
    client.post("/api/sessions/check-in", json={"plate_number": "29A12346", "vehicle_type_id": type_ids["MOTORBIKE"]},
                headers=staff_headers)
    res = client.put(f"/api/vehicle-types/{type_ids['MOTORBIKE']}", json={"capacity": 1}, headers=manager_headers)
    assert res.status_code == 400
    assert res.get_json()["error"]["code"] == "CAPACITY_BELOW_OCCUPANCY"
    res = client.put(f"/api/vehicle-types/{type_ids['MOTORBIKE']}", json={"capacity": 10}, headers=manager_headers)
    assert res.get_json()["capacity"] == 10


def test_price_change_preserves_completed_payments(client, staff_headers, manager_headers, type_ids):
    moto = type_ids["MOTORBIKE"]
    sid = client.post("/api/sessions/check-in", json={"plate_number": "29A12345", "vehicle_type_id": moto},
                      headers=staff_headers).get_json()["session"]["id"]
    client.post(f"/api/sessions/{sid}/checkout", json={"plate_number": "29A12345", "vehicle_type_id": moto},
                headers=staff_headers)
    client.post(f"/api/sessions/{sid}/pay", json={}, headers=staff_headers)

    res = client.post("/api/prices", json={"vehicle_type_id": moto, "pricing_method": "PER_TURN", "unit_price": 8000},
                      headers=manager_headers)
    assert res.status_code == 201

    session = client.get(f"/api/sessions/{sid}", headers=staff_headers).get_json()
    assert session["fee_amount"] == 5000
    assert session["payment"]["amount"] == 5000

    current = client.get("/api/prices/current", headers=staff_headers).get_json()
    assert next(c for c in current if c["vehicle_type"]["id"] == moto)["price_rule"]["unit_price"] == 8000

    # Bảng giá đã áp dụng không xoá được
    old_rule_id = session["price_rule"]["id"]
    assert client.delete(f"/api/prices/{old_rule_id}", headers=manager_headers).status_code == 409


def test_scheduled_price_can_be_cancelled(client, manager_headers, type_ids):
    future = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
    res = client.post("/api/prices", json={"vehicle_type_id": type_ids["CAR"], "pricing_method": "PER_DAY",
                                           "unit_price": 100000, "effective_from": future}, headers=manager_headers)
    rule_id = res.get_json()["id"]
    states = {p["id"]: p["state"] for p in client.get("/api/prices", headers=manager_headers).get_json()}
    assert states[rule_id] == "SCHEDULED"
    assert client.delete(f"/api/prices/{rule_id}", headers=manager_headers).status_code == 200


def test_reports(client, staff_headers, manager_headers, type_ids):
    moto = type_ids["MOTORBIKE"]
    sid = client.post("/api/sessions/check-in", json={"plate_number": "29A12345", "vehicle_type_id": moto},
                      headers=staff_headers).get_json()["session"]["id"]
    client.post("/api/sessions/check-in", json={"plate_number": "30A11111", "vehicle_type_id": type_ids["CAR"]},
                headers=staff_headers)
    client.post(f"/api/sessions/{sid}/checkout", json={"plate_number": "29A12345", "vehicle_type_id": moto},
                headers=staff_headers)
    client.post(f"/api/sessions/{sid}/pay", json={"method": "TRANSFER"}, headers=staff_headers)

    traffic = client.get("/api/reports/traffic", headers=manager_headers).get_json()
    assert traffic["total_check_ins"] == 2
    assert traffic["total_check_outs"] == 1
    assert traffic["current_capacity"]["total_occupied"] == 1

    revenue = client.get("/api/reports/revenue", headers=manager_headers).get_json()
    assert revenue["total_amount"] == 5000
    assert revenue["by_method"] == [{"method": "TRANSFER", "transactions": 1, "amount": 5000}]

    filtered = client.get(f"/api/reports/revenue?vehicle_type_id={type_ids['CAR']}", headers=manager_headers)
    assert filtered.get_json()["total_amount"] == 0

    bad = client.get("/api/reports/revenue?from=2026-10-10&to=2026-10-01", headers=manager_headers)
    assert bad.status_code == 400

    dash = client.get("/api/dashboard", headers=manager_headers).get_json()
    assert dash["revenue_today"] == 5000
    assert "revenue_today" not in client.get("/api/dashboard", headers=staff_headers).get_json()
