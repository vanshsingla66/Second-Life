"""Seed the DB on first run: fake users, the 200 past sales, ~25 active listings, a few wanted/swap rows.

All people are obviously fake ("Demo Student N", @example.com). Demo login: demo@example.com / Demo@1234
"""
import random

from sqlmodel import Session, select

from . import pricing
from .auth import hash_password
from .models import Listing, Swap, User, Wanted

DEMO_EMAIL = "demo@example.com"
DEMO_PASSWORD = "Demo@1234"

NAMES = ["Demo Student", "Demo Senior Asha", "Demo Senior Ravi", "Demo Senior Meera", "Demo Senior Kabir",
         "Demo Junior Isha", "Demo Junior Dev", "Demo Senior Nila"]

# title, category, condition, age_years, original_price, price vs suggested, description
ACTIVE = [
    ("Scientific Calculator fx-991", "calculators", "good", 2, 1200, 0.95, "Works perfectly, minor scratches on the cover."),
    ("Graphing Calculator", "calculators", "like_new", 1, 2100, 1.05, "Barely used, comes with the case."),
    ("Scientific Calculator fx-82", "calculators", "fair", 3, 800, 0.85, "Solar panel fine, a few worn keys."),
    ("Geared Cycle 21-speed", "cycles", "good", 2, 9800, 0.9, "Serviced last month, new tyres."),
    ("City Cycle Single Speed", "cycles", "fair", 3, 4800, 1.0, "Sturdy daily ride, needs a fresh chain."),
    ("Mountain Bike 26in", "cycles", "like_new", 1, 13500, 1.25, "Hardly used, front suspension."),
    ("Foldable Cycle", "cycles", "good", 1.5, 8500, 0.82, "Folds in seconds, fits under a hostel bed."),
    ("Engineering Mathematics Vol 1", "textbooks", "good", 1, 650, 0.92, "Some highlighting in chapters 1-4."),
    ("Data Structures Textbook", "textbooks", "like_new", 1, 900, 1.0, "Clean copy, no markings."),
    ("Thermodynamics Handbook", "textbooks", "fair", 3, 750, 1.3, "Old edition, notes in the margins."),
    ("Physics for Engineers", "textbooks", "good", 2, 700, 0.88, "Cover slightly worn."),
    ("Signals and Systems", "textbooks", "good", 2, 1100, 0.95, "Includes solved problem notes."),
    ("Operating Systems Concepts", "textbooks", "new", 0.5, 1500, 0.97, "Bought but barely opened."),
    ("Lab Coat (White)", "lab_coats", "good", 1, 450, 0.9, "Washed, size M."),
    ("Chemistry Lab Coat", "lab_coats", "fair", 2, 400, 1.15, "A small stain on the sleeve, size L."),
    ("Study Table Lamp", "hostel_essentials", "good", 1.5, 900, 0.85, "LED, three brightness levels."),
    ("Mini Table Fan", "hostel_essentials", "good", 2, 1200, 0.95, "Quiet and strong, USB powered."),
    ("Foldable Study Desk", "hostel_essentials", "like_new", 1, 2400, 1.0, "Lightweight, folds flat."),
    ("Electric Kettle", "hostel_essentials", "fair", 2, 1100, 0.8, "Works great, a little discoloured inside."),
    ("Hostel Mattress", "hostel_essentials", "good", 1, 3200, 1.1, "Single size, with a washable cover."),
    ("Bluetooth Speaker", "electronics", "good", 1.5, 2500, 0.9, "Loud and clear, 8-hour battery."),
    ("Power Bank 10000mAh", "electronics", "good", 1, 1300, 0.85, "Holds charge well."),
    ("Mechanical Keyboard", "electronics", "like_new", 1, 4200, 1.2, "Blue switches, RGB backlight."),
    ("Wireless Mouse", "electronics", "fair", 2, 900, 0.9, "Works, needs one AA battery."),
    ("Laptop Stand", "electronics", "good", 1, 1200, 0.78, "Adjustable aluminium stand."),
]


def seed(engine) -> None:
    with Session(engine) as s:
        if s.exec(select(User)).first():
            return
        users = []
        for i, name in enumerate(NAMES):
            email = DEMO_EMAIL if i == 0 else f"demo{i}@example.com"
            u = User(name=name, email=email, password_hash=hash_password(DEMO_PASSWORD),
                     response_rate=round(random.Random(i).uniform(0.6, 0.99), 2))
            s.add(u)
            users.append(u)
        s.commit()
        for u in users:
            s.refresh(u)

        rng = random.Random(7)
        weights = [1, 8, 5, 3, 2, 1, 1, 4]  # uneven so trust badges differ
        sales = pricing.load_sales()
        for r in sales:
            seller = rng.choices(users[1:], weights=weights[1:])[0]
            title = r["item_name"]
            s.add(Listing(
                seller_id=seller.id, title=title, category=r["category"], condition=r["condition"],
                age_years=r["age_years"], original_price=r["original_price"], price=r["sold_price"],
                suggested_price=r["sold_price"], suggested_low=r["sold_price"], suggested_high=r["sold_price"],
                description="Past sale", status="sold"))
        # the demo account has a few sales so its profile is not empty
        for r in sales[:3]:
            s.add(Listing(
                seller_id=users[0].id, title=r["item_name"], category=r["category"], condition=r["condition"],
                age_years=r["age_years"], original_price=r["original_price"], price=r["sold_price"],
                suggested_price=r["sold_price"], suggested_low=r["sold_price"], suggested_high=r["sold_price"],
                description="Past sale", status="sold"))

        active = []
        for i, (title, cat, cond, age, orig, factor, desc) in enumerate(ACTIVE):
            seller = users[0] if i in (0, 3, 7) else users[1 + (i % (len(users) - 1))]
            sug = pricing.suggest(cat, cond, age, orig)
            price = max(int(round(sug["suggested_price"] * factor / 10) * 10), 10)
            l = Listing(seller_id=seller.id, title=title, category=cat, condition=cond, age_years=age,
                        original_price=orig, price=price, suggested_price=sug["suggested_price"],
                        suggested_low=sug["low"], suggested_high=sug["high"], description=desc)
            s.add(l)
            active.append(l)
        s.commit()
        for l in active:
            s.refresh(l)

        s.add_all([
            Wanted(user_id=users[5].id, title="Cycle for hostel commute", category="cycles", max_price=4000,
                   note="Anything that rides well, geared or not."),
            Wanted(user_id=users[6].id, title="Scientific calculator", category="calculators", max_price=700),
            Wanted(user_id=users[5].id, title="Engineering drawing set", category=None, max_price=500,
                   note="Drafter and set squares."),
        ])
        # one incoming swap for the demo user so the inbox is not empty
        mine = next(l for l in active if l.seller_id == users[0].id and l.category == "calculators")
        theirs = next(l for l in active if l.seller_id != users[0].id and l.category == "textbooks")
        s.add(Swap(proposer_id=theirs.seller_id, owner_id=users[0].id, offered_listing_id=theirs.id,
                   requested_listing_id=mine.id, cash_topup=int(round((mine.suggested_price - theirs.suggested_price) / 10) * 10)))
        s.commit()
