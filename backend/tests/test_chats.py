from tests.conftest import CALC, auth_header, register


def setup(client):
    seller = auth_header(register(client, name="Seller", email="s@example.com"))
    buyer = auth_header(register(client, name="Buyer", email="b@example.com"))
    listing = client.post("/listings", headers=seller, json={**CALC, "price": 540}).json()
    return seller, buyer, listing


def test_buyer_messages_seller_and_unread_counts(client):
    seller, buyer, l = setup(client)
    c = client.post("/chats", json={"listing_id": l["id"]}, headers=buyer).json()
    assert client.get("/chats", headers=seller).json() == []  # empty chats stay hidden
    t = client.post(f"/chats/{c['id']}/messages", json={"body": "Is this still available?"}, headers=buyer)
    assert t.status_code == 201 and t.json()["messages"][0]["mine"] is True
    assert client.get("/chats/unread", headers=seller).json()["unread"] == 1
    inbox = client.get("/chats", headers=seller).json()
    assert inbox[0]["other"]["name"] == "Buyer" and inbox[0]["i_am_seller"] and inbox[0]["unread"] == 1
    thread = client.get(f"/chats/{c['id']}", headers=seller).json()
    assert thread["messages"][0]["mine"] is False
    assert client.get("/chats/unread", headers=seller).json()["unread"] == 0  # opening marks read
    # same buyer reopening gets the same conversation
    assert client.post("/chats", json={"listing_id": l["id"]}, headers=buyer).json()["id"] == c["id"]


def test_offer_flow_and_permissions(client):
    seller, buyer, l = setup(client)
    c = client.post("/chats", json={"listing_id": l["id"]}, headers=buyer).json()
    assert client.post(f"/chats/{c['id']}/messages", json={"offer_price": 300}, headers=seller).status_code == 403
    t = client.post(f"/chats/{c['id']}/messages", json={"offer_price": 480, "body": "Can you do this?"}, headers=buyer).json()
    offer = t["messages"][-1]
    assert offer["offer_status"] == "pending" and offer["offer_label"] in ("steal", "fair")
    assert client.post(f"/chats/{c['id']}/offers/{offer['id']}", json={"accept": True}, headers=buyer).status_code == 403
    t = client.post(f"/chats/{c['id']}/offers/{offer['id']}", json={"accept": True}, headers=seller).json()
    assert t["messages"][-2]["offer_status"] == "accepted" and "Deal" in t["messages"][-1]["body"]
    assert client.post(f"/chats/{c['id']}/offers/{offer['id']}", json={"accept": False}, headers=seller).status_code == 409


def test_cannot_chat_about_own_listing_or_read_others_chats(client):
    seller, buyer, l = setup(client)
    assert client.post("/chats", json={"listing_id": l["id"]}, headers=seller).status_code == 400
    c = client.post("/chats", json={"listing_id": l["id"]}, headers=buyer).json()
    stranger = auth_header(register(client, name="X", email="x@example.com"))
    assert client.get(f"/chats/{c['id']}", headers=stranger).status_code == 404
    assert client.post(f"/chats/{c['id']}/messages", json={"body": "  "}, headers=buyer).status_code == 422


def test_deleting_listing_removes_its_chats(client):
    seller, buyer, l = setup(client)
    c = client.post("/chats", json={"listing_id": l["id"]}, headers=buyer).json()
    client.post(f"/chats/{c['id']}/messages", json={"body": "hi"}, headers=buyer)
    assert client.delete(f"/listings/{l['id']}", headers=seller).status_code == 204
    assert client.get("/chats", headers=buyer).json() == []
