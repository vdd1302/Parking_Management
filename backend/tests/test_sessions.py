from datetime import timedelta

from app.extensions import db
from app.models import ParkingSession


def check_in(client, headers, plate, type_id):
    return client.post("/api/sessions/check-in", json={"plate_number": plate, "vehicle_type_id": type_id},
                       headers=headers)


def test_check_in_creates_session(client, staff_headers, type_ids):
    res = check_in(client, staff_headers, "29a-123.45", type_ids["MOTORBIKE"])
    assert res.status_code == 201
    body = res.get_json()
    assert body["session"]["plate_number"] == "29A-123.45"
    assert body["session"]["status"] == "ACTIVE"
    assert body["session"]["code"].startswith("LG")
    assert body["capacity"]["available"] == 1


def test_check_in_rejects_invalid_plate(client, staff_headers, type_ids):
    res = check_in(client, staff_headers, "ABC", type_ids["MOTORBIKE"])
    assert res.get_json()["error"]["code"] == "INVALID_PLATE"


def test_duplicate_active_session(client, staff_headers, type_ids):
    check_in(client, staff_headers, "29A12345", type_ids["MOTORBIKE"])
    res = check_in(client, staff_headers, "29A-123.45", type_ids["MOTORBIKE"])
    assert res.status_code == 409
    assert res.get_json()["error"]["code"] == "DUPLICATE_ACTIVE_SESSION"


def test_lot_full(client, staff_headers, type_ids):
    assert check_in(client, staff_headers, "30A11111", type_ids["CAR"]).status_code == 201
    res = check_in(client, staff_headers, "30A22222", type_ids["CAR"])
    assert res.status_code == 409
    assert res.get_json()["error"]["code"] == "LOT_FULL"


def test_full_checkout_flow_releases_capacity(client, app, staff_headers, type_ids):
    sid = check_in(client, staff_headers, "30A11111", type_ids["CAR"]).get_json()["session"]["id"]
    # Giả lập xe đã gửi 2 giờ 10 phút -> 3 giờ * 20.000
    with app.app_context():
        s = db.session.get(ParkingSession, sid)
        s.check_in_at = s.check_in_at - timedelta(hours=2, minutes=10)
        db.session.commit()

    found = client.get("/api/sessions/lookup?q=30a-111.11", headers=staff_headers).get_json()
    assert found["id"] == sid

    res = client.post(f"/api/sessions/{sid}/checkout",
                      json={"plate_number": "30A-111.11", "vehicle_type_id": type_ids["CAR"]}, headers=staff_headers)
    assert res.status_code == 200
    assert res.get_json()["status"] == "PENDING_PAYMENT"
    assert res.get_json()["fee_amount"] == 60000

    # Chưa thanh toán -> vẫn chiếm chỗ
    assert check_in(client, staff_headers, "30A22222", type_ids["CAR"]).get_json()["error"]["code"] == "LOT_FULL"

    res = client.post(f"/api/sessions/{sid}/pay", json={"method": "CASH"}, headers=staff_headers)
    assert res.status_code == 200
    assert res.get_json()["status"] == "COMPLETED"
    assert res.get_json()["payment"]["amount"] == 60000

    assert client.post(f"/api/sessions/{sid}/pay", json={}, headers=staff_headers).get_json()["error"]["code"] \
        == "ALREADY_PAID"
    assert check_in(client, staff_headers, "30A22222", type_ids["CAR"]).status_code == 201


def test_pay_requires_checkout_first(client, staff_headers, type_ids):
    sid = check_in(client, staff_headers, "29A12345", type_ids["MOTORBIKE"]).get_json()["session"]["id"]
    res = client.post(f"/api/sessions/{sid}/pay", json={}, headers=staff_headers)
    assert res.get_json()["error"]["code"] == "INVALID_STATE"


def test_mismatch_blocks_staff_but_manager_can_override(client, staff_headers, manager_headers, type_ids):
    sid = check_in(client, staff_headers, "29A12345", type_ids["MOTORBIKE"]).get_json()["session"]["id"]
    payload = {"plate_number": "29A99999", "vehicle_type_id": type_ids["MOTORBIKE"], "override": True}
    res = client.post(f"/api/sessions/{sid}/checkout", json=payload, headers=staff_headers)
    assert res.status_code == 409
    assert res.get_json()["error"]["code"] == "VEHICLE_MISMATCH"

    payload["override_note"] = "Khách xuất trình giấy tờ xe"
    res = client.post(f"/api/sessions/{sid}/checkout", json=payload, headers=manager_headers)
    assert res.status_code == 200
    assert res.get_json()["fee_amount"] == 5000


def test_lookup_not_found(client, staff_headers):
    res = client.get("/api/sessions/lookup?q=LG000", headers=staff_headers)
    assert res.status_code == 404
    assert res.get_json()["error"]["code"] == "SESSION_NOT_FOUND"


def test_cancel_checkout(client, staff_headers, type_ids):
    sid = check_in(client, staff_headers, "29A12345", type_ids["MOTORBIKE"]).get_json()["session"]["id"]
    client.post(f"/api/sessions/{sid}/checkout",
                json={"plate_number": "29A12345", "vehicle_type_id": type_ids["MOTORBIKE"]}, headers=staff_headers)
    res = client.post(f"/api/sessions/{sid}/cancel-checkout", headers=staff_headers)
    assert res.get_json()["status"] == "ACTIVE"
    assert res.get_json()["fee_amount"] is None


def test_search_sessions(client, staff_headers, type_ids):
    check_in(client, staff_headers, "29A12345", type_ids["MOTORBIKE"])
    check_in(client, staff_headers, "30A11111", type_ids["CAR"])
    res = client.get("/api/sessions?plate=123&status=ACTIVE", headers=staff_headers).get_json()
    assert res["total"] == 1
    res = client.get(f"/api/sessions?vehicle_type_id={type_ids['CAR']}", headers=staff_headers).get_json()
    assert res["items"][0]["plate_number"] == "30A11111"


def test_incident_escalation(client, staff_headers, manager_headers):
    res = client.post("/api/incidents", json={"type": "INFO_MISMATCH", "plate_number": "29A12345",
                                              "description": "Biển số không khớp vé"}, headers=staff_headers)
    assert res.status_code == 201
    iid = res.get_json()["id"]
    assert client.post(f"/api/incidents/{iid}/resolve", json={"resolution_note": "ok"},
                       headers=staff_headers).status_code == 403
    res = client.post(f"/api/incidents/{iid}/resolve", json={"resolution_note": "Đã xác minh"},
                      headers=manager_headers)
    assert res.get_json()["status"] == "RESOLVED"
