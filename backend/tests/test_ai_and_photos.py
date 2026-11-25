import json

import pytest

from app import ai, config
from app.routes import ai as ai_routes
from tests.conftest import CALC, auth_header, register

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


def upload(client, h):
    r = client.post("/uploads", headers=h, files={"file": ("p.png", PNG, "image/png")})
    assert r.status_code == 201, r.text
    return r.json()["url"]


@pytest.fixture()
def h(client):
    ai_routes.ai_limiter.reset()
    return auth_header(register(client))


def test_listing_keeps_multiple_photos_cover_first(client, h):
    urls = [upload(client, h) for _ in range(3)]
    l = client.post("/listings", headers=h, json={**CALC, "image_urls": urls}).json()
    assert l["image_urls"] == urls and l["image_url"] == urls[0]
    l = client.put(f"/listings/{l['id']}", headers=h, json={"image_urls": urls[1:]}).json()
    assert l["image_urls"] == urls[1:] and l["image_url"] == urls[1]
    l = client.put(f"/listings/{l['id']}", headers=h, json={"image_urls": []}).json()
    assert l["image_urls"] == [] and l["image_url"] is None


def test_photo_list_rejects_outside_urls_and_more_than_six(client, h):
    assert client.post("/listings", headers=h, json={**CALC, "image_urls": ["https://evil.example/x.jpg"]}).status_code == 422
    url = upload(client, h)
    assert client.post("/listings", headers=h, json={**CALC, "image_urls": [url] * 7}).status_code == 422


def test_single_image_url_still_works(client, h):
    url = upload(client, h)
    l = client.post("/listings", headers=h, json={**CALC, "image_url": url}).json()
    assert l["image_urls"] == [url]


def test_ai_off_without_key(client, h, monkeypatch):
    monkeypatch.setattr(config, "GEMINI_API_KEY", "")
    assert client.get("/ai/status").json()["enabled"] is False
    r = client.post("/ai/chat", headers=h, json={"messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 503 and "GEMINI_API_KEY" in r.json()["detail"]


def test_ai_needs_sign_in(client):
    assert client.post("/ai/chat", json={"messages": [{"role": "user", "content": "hi"}]}).status_code == 401


def test_identify_reads_uploaded_photo_and_cleans_answer(client, h, monkeypatch):
    monkeypatch.setattr(config, "GEMINI_API_KEY", "test-key")
    seen = {}

    def fake_generate(contents, system, schema=None, temperature=0.4):
        seen["parts"] = contents[0]["parts"]
        return json.dumps({"is_product": True, "title": "Casio fx-991EX", "brand": "Casio", "model": "fx-991EX",
                           "category": "calculators", "condition": "good", "original_price_inr": 1350,
                           "description": "Works fine.", "highlights": ["552 functions"], "confidence": "high"})

    monkeypatch.setattr(ai, "generate", fake_generate)
    url = upload(client, h)
    r = client.post("/ai/identify", headers=h, json={"image_urls": [url]})
    assert r.status_code == 200, r.text
    assert r.json()["brand"] == "Casio" and r.json()["category"] == "calculators"
    assert seen["parts"][0]["inline_data"]["mime_type"] == "image/png"


def test_identify_rejects_paths_outside_uploads(client, h, monkeypatch):
    monkeypatch.setattr(config, "GEMINI_API_KEY", "test-key")
    for bad in ["/uploads/../.env", "/etc/passwd", "/uploads/" + "a" * 24 + ".jpg"]:
        assert client.post("/ai/identify", headers=h, json={"image_urls": [bad]}).status_code == 422


def test_chat_only_returns_real_listing_ids(client, h, monkeypatch):
    monkeypatch.setattr(config, "GEMINI_API_KEY", "test-key")
    l = client.post("/listings", headers=h, json=CALC).json()
    monkeypatch.setattr(ai, "generate", lambda *a, **k: f"Try the calculator [#{l['id']}] or [#99999].")
    r = client.post("/ai/chat", headers=h, json={"messages": [{"role": "user", "content": "calculator?"}]})
    assert r.status_code == 200 and r.json()["listing_ids"] == [l["id"]]


def test_busy_model_falls_back_to_next(monkeypatch):
    import httpx
    monkeypatch.setattr(config, "GEMINI_API_KEY", "test-key")
    calls = []

    def fake_post(url, **kw):
        calls.append(url)
        if len(calls) == 1:
            return httpx.Response(503, json={"error": {"message": "high demand"}})
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [
            {"text": "thinking", "thought": True}, {"text": "Hello!"}]}}]})

    monkeypatch.setattr(ai.httpx, "post", fake_post)
    assert ai.generate([{"role": "user", "parts": [{"text": "hi"}]}], "sys") == "Hello!"
    assert len(calls) == 2 and calls[0] != calls[1]
