def test_login_wrong_password(client):
    res = client.post("/api/auth/login", json={"username": "staff", "password": "nope"})
    assert res.status_code == 401
    assert res.get_json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_me_requires_token(client):
    assert client.get("/api/auth/me").status_code == 401


def test_staff_cannot_use_manager_functions(client, staff_headers):
    assert client.get("/api/users", headers=staff_headers).status_code == 403
    assert client.get("/api/reports/revenue", headers=staff_headers).status_code == 403
    assert client.put("/api/lot", json={"name": "x"}, headers=staff_headers).status_code == 403
    res = client.post("/api/prices", json={}, headers=staff_headers)
    assert res.get_json()["error"]["code"] == "FORBIDDEN"


def test_locked_account_is_rejected_immediately(client, manager_headers, staff_headers):
    users = client.get("/api/users", headers=manager_headers).get_json()["items"]
    staff_id = next(u["id"] for u in users if u["username"] == "staff")
    assert client.put(f"/api/users/{staff_id}", json={"is_active": False}, headers=manager_headers).status_code == 200

    # Token cũ không còn dùng được và không đăng nhập lại được
    assert client.get("/api/auth/me", headers=staff_headers).status_code == 401
    res = client.post("/api/auth/login", json={"username": "staff", "password": "secret1"})
    assert res.get_json()["error"]["code"] == "ACCOUNT_DISABLED"


def test_manager_cannot_lock_self(client, manager_headers):
    me = client.get("/api/auth/me", headers=manager_headers).get_json()
    res = client.put(f"/api/users/{me['id']}", json={"is_active": False}, headers=manager_headers)
    assert res.status_code == 403
