import pytest

from app import pricing


def test_calculator_gate_example():
    r = pricing.suggest("calculators", "good", 2, 1200)
    assert 0 < r["suggested_price"] < 1200
    assert r["low"] <= r["suggested_price"] <= r["high"]
    assert len(r["explanation"]) >= 3 and all(r["explanation"])
    assert r["comparables"]


def test_price_never_increases_with_age():
    for cat in pricing.categories():
        prices = [pricing.suggest(cat, "good", a, 1000, month=9)["suggested_price"] for a in (0.5, 1, 2, 3.5, 5)]
        assert prices == sorted(prices, reverse=True), (cat, prices)


def test_condition_ordering():
    prices = [pricing.suggest("cycles", c, 2, 8000, month=9)["suggested_price"] for c in pricing.conditions()]
    assert prices == sorted(prices, reverse=True)


def test_unknown_category_falls_back_with_low_confidence():
    r = pricing.suggest("drones", "good", 1, 5000)
    assert r["confidence"] == "low"
    assert "all categories" in r["explanation"][0]


def test_never_exceeds_original():
    r = pricing.suggest("calculators", "new", 0, 1000, month=8)
    assert r["high"] <= 1000


def test_endpoint_ok(client):
    r = client.post("/price/suggest", json={"category": "calculators", "condition": "good", "age_years": 2, "original_price": 1200})
    assert r.status_code == 200
    body = r.json()
    assert body["suggested_price"] < 1200 and body["explanation"]


@pytest.mark.parametrize("payload", [
    {"category": "calculators", "condition": "good", "age_years": -1, "original_price": 1200},
    {"category": "calculators", "condition": "good", "age_years": 2, "original_price": 0},
    {"category": "calculators", "condition": "good", "age_years": 2},
    {"category": "calculators", "condition": "mint", "age_years": 2, "original_price": 1200},
])
def test_endpoint_validation(client, payload):
    assert client.post("/price/suggest", json=payload).status_code == 422
