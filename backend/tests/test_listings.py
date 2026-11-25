from tests.conftest import CALC, auth_header, register


def test_create_search_filter(client):
    t = register(client)
    h = auth_header(t)
    r = client.post("/listings", json=CALC, headers=h)
    assert r.status_code == 201
    created = r.json()
    assert created["price"] == created["suggested_price"] < 1200  # defaults to the suggested price

    client.post("/listings", json={**CALC, "title": "Old Cycle", "category": "cycles", "condition": "fair",
                                   "original_price": 6000, "price": 1500}, headers=h)

    assert client.get("/listings").json()["total"] == 2
    assert client.get("/listings?q=calculator").json()["total"] == 1
    assert client.get("/listings?category=cycles").json()["items"][0]["title"] == "Old Cycle"
    assert client.get("/listings?condition=good,like_new").json()["total"] == 1
    assert client.get("/listings?min_price=1000").json()["total"] == 1
    assert client.get("/listings?max_price=1000").json()["total"] == 1
    prices = [i["price"] for i in client.get("/listings?sort=price_desc").json()["items"]]
    assert prices == sorted(prices, reverse=True)


def test_detail_has_why_this_price(client):
    h = auth_header(register(client))
    lid = client.post("/listings", json=CALC, headers=h).json()["id"]
    d = client.get(f"/listings/{lid}").json()
    assert d["pricing"]["explanation"] and d["pricing"]["comparables"]
    assert client.get("/listings/9999").status_code == 404


def test_owner_only_edit_delete_and_sold(client):
    a = auth_header(register(client))
    b = auth_header(register(client, "Other", "o@example.com"))
    lid = client.post("/listings", json=CALC, headers=a).json()["id"]
    assert client.put(f"/listings/{lid}", json={"price": 400}, headers=b).status_code == 403
    assert client.delete(f"/listings/{lid}", headers=b).status_code == 403
    assert client.put(f"/listings/{lid}", json={"price": 400}, headers=a).json()["price"] == 400
    changed = client.put(f"/listings/{lid}", json={"condition": "poor"}, headers=a).json()
    assert changed["suggested_price"] < 540  # suggestion refreshed for the new condition
    assert client.post(f"/listings/{lid}/sold", headers=a).json()["status"] == "sold"
    assert client.get("/listings").json()["total"] == 0
    assert client.get("/listings/mine", headers=a).json()[0]["status"] == "sold"
    assert client.delete(f"/listings/{lid}", headers=a).status_code == 204


def test_validation_errors(client):
    h = auth_header(register(client))
    assert client.post("/listings", json={**CALC, "original_price": 0}, headers=h).status_code == 422
    assert client.post("/listings", json={**CALC, "age_years": -2}, headers=h).status_code == 422
    assert client.post("/listings", json={**CALC, "condition": "mint"}, headers=h).status_code == 422
    assert client.get("/listings?sort=bogus").status_code == 422


def test_wanted_matches(client):
    seller = auth_header(register(client))
    buyer = auth_header(register(client, "Buyer", "b@example.com"))
    client.post("/listings", json=CALC, headers=seller)
    w = client.post("/wanted", json={"title": "Scientific calculator", "category": "calculators", "max_price": 800}, headers=buyer)
    assert w.status_code == 201 and w.json()["match_count"] == 1
    assert len(client.get(f"/wanted/{w.json()['id']}/matches").json()) == 1
    low = client.post("/wanted", json={"title": "Calculator", "category": "calculators", "max_price": 100}, headers=buyer)
    assert low.json()["match_count"] == 0


def test_swap_flow_with_topup(client):
    a = auth_header(register(client, "A", "a@example.com"))
    b = auth_header(register(client, "B", "b@example.com"))
    calc = client.post("/listings", json=CALC, headers=a).json()
    cycle = client.post("/listings", json={**CALC, "title": "Cycle", "category": "cycles", "original_price": 8000}, headers=b).json()
    q = client.get(f"/swaps/quote?offered_listing_id={calc['id']}&requested_listing_id={cycle['id']}", headers=a).json()
    assert q["cash_topup"] > 0 and q["requested_value"] > q["offered_value"]

    s = client.post("/swaps", json={"offered_listing_id": calc["id"], "requested_listing_id": cycle["id"]}, headers=a)
    assert s.status_code == 201 and s.json()["direction"] == "outgoing"
    assert client.post("/swaps", json={"offered_listing_id": calc["id"], "requested_listing_id": cycle["id"]}, headers=a).status_code == 409
    assert client.post("/swaps", json={"offered_listing_id": cycle["id"], "requested_listing_id": calc["id"]}, headers=a).status_code == 403
    inbox = client.get("/swaps", headers=b).json()
    assert inbox[0]["direction"] == "incoming"
    sid = s.json()["id"]
    assert client.post(f"/swaps/{sid}/accept", headers=a).status_code == 403  # only the owner may respond
    assert client.post(f"/swaps/{sid}/accept", headers=b).json()["status"] == "accepted"
    assert client.get(f"/listings/{calc['id']}").json()["status"] == "swapped"
    assert client.get(f"/sellers/{calc['seller']['id']}/trust").json()["swaps_done"] == 1
    assert client.get("/me/stats", headers=a).json()["green"]["co2_kg"] > 0


def test_trust_badge_and_insights(client):
    t = register(client)
    trust = client.get(f"/sellers/{t['user']['id']}/trust").json()
    assert trust["badge"] == "bronze"
    ins = client.get("/insights").json()
    assert ins["headline"] and ins["curves"]["calculators"][0]["retention"] > ins["curves"]["calculators"][-1]["retention"]


def test_read_cache_is_cleared_by_writes(client):
    h = auth_header(register(client))
    assert client.get("/listings").json()["total"] == 0
    assert client.get("/listings").headers["x-cache"] == "HIT"
    client.post("/listings", json=CALC, headers=h)
    r = client.get("/listings")
    assert r.json()["total"] == 1 and r.headers["x-cache"] == "MISS"
    assert "x-cache" not in client.get("/listings/mine", headers=h).headers  # user-specific: never cached


def test_sign_in_and_price_suggestions_keep_the_read_cache(client):
    client.get("/insights")
    assert client.get("/insights").headers["x-cache"] == "HIT"
    register(client, email="cache@example.com")
    client.post("/price/suggest", json={k: CALC[k] for k in ("category", "condition", "age_years", "original_price")})
    assert client.get("/insights").headers["x-cache"] == "HIT"
