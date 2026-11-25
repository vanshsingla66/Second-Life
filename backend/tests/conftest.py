import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app import auth as A
from app.cache import ReadCacheMiddleware
from app.db import get_session
from app.main import app


@pytest.fixture()
def client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)

    def override():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_session] = override
    A.login_limiter.reset()
    ReadCacheMiddleware.clear()
    yield TestClient(app)  # no context manager: skip the seeding lifespan
    app.dependency_overrides.clear()


def register(client, name="Test User", email="t@example.com", password="Password123"):
    r = client.post("/auth/register", json={"name": name, "email": email, "password": password})
    assert r.status_code == 201, r.text
    return r.json()


def auth_header(tokens):
    return {"Authorization": f"Bearer {tokens['access_token']}"}


CALC = {"title": "Scientific Calculator", "category": "calculators", "condition": "good",
        "age_years": 2, "original_price": 1200}
