from app import auth as A
from tests.conftest import auth_header, register


def test_register_login_me(client):
    tokens = register(client)
    assert client.get("/me", headers=auth_header(tokens)).json()["email"] == "t@example.com"
    r = client.post("/auth/login", json={"email": "T@example.com", "password": "Password123"})
    assert r.status_code == 200 and r.json()["user"]["name"] == "Test User"


def test_duplicate_email_and_bad_password(client):
    register(client)
    assert client.post("/auth/register", json={"name": "x", "email": "t@example.com", "password": "Password123"}).status_code == 409
    assert client.post("/auth/register", json={"name": "x", "email": "new@example.com", "password": "short"}).status_code == 422
    assert client.post("/auth/login", json={"email": "t@example.com", "password": "wrong-password"}).status_code == 401
    assert client.post("/auth/login", json={"email": "nobody@example.com", "password": "whatever123"}).status_code == 401


def test_protected_route_requires_token(client):
    assert client.get("/me").status_code == 401
    assert client.get("/me", headers={"Authorization": "Bearer garbage"}).status_code == 401
    assert client.post("/listings", json={}).status_code == 401


def test_refresh_rotation_and_reuse_detection(client):
    t1 = register(client)
    r = client.post("/auth/refresh", json={"refresh_token": t1["refresh_token"]})
    assert r.status_code == 200
    t2 = r.json()
    assert t2["refresh_token"] != t1["refresh_token"]
    # old token is now revoked -> reuse is rejected and the whole family is revoked
    assert client.post("/auth/refresh", json={"refresh_token": t1["refresh_token"]}).status_code == 401
    assert client.post("/auth/refresh", json={"refresh_token": t2["refresh_token"]}).status_code == 401


def test_logout_revokes_refresh_token(client):
    t = register(client)
    assert client.post("/auth/logout", json={"refresh_token": t["refresh_token"]}).status_code == 204
    assert client.post("/auth/refresh", json={"refresh_token": t["refresh_token"]}).status_code == 401


def test_expired_access_token_rejected(client, monkeypatch):
    t = register(client)
    monkeypatch.setattr("app.config.ACCESS_TOKEN_MINUTES", -1)
    expired = A.create_access_token(t["user"]["id"])
    r = client.get("/me", headers={"Authorization": f"Bearer {expired}"})
    assert r.status_code == 401 and "expired" in r.json()["detail"].lower()


def test_login_rate_limit(client):
    register(client)
    codes = [client.post("/auth/login", json={"email": "t@example.com", "password": "bad-password"}).status_code for _ in range(10)]
    assert codes[:8] == [401] * 8 and 429 in codes[8:]


def test_google_login(client, monkeypatch):
    monkeypatch.setattr("app.routes.auth.A.verify_google_id_token",
                        lambda tok: {"email": "g@example.com", "name": "G User", "sub": "123", "email_verified": True})
    r = client.post("/auth/google", json={"id_token": "fake"})
    assert r.status_code == 200 and r.json()["user"]["email"] == "g@example.com"
    again = client.post("/auth/google", json={"id_token": "fake"}).json()
    assert again["user"]["id"] == r.json()["user"]["id"]


def test_google_not_configured(client, monkeypatch):
    monkeypatch.setattr("app.config.GOOGLE_CLIENT_IDS", [])
    assert client.post("/auth/google", json={"id_token": "x"}).status_code == 503
