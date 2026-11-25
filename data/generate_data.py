"""Generate 200 fake past listings for GREEN · Second Life.

All data is synthetic. Prices come from a hidden per-category depreciation formula:

    sold = original * base_retention * exp(-k * age) * condition_multiplier * season * noise

Run:  python generate_data.py   ->  listings.csv
"""
import csv
import math
import random
from pathlib import Path

SEED = 42
N = 200

CONDITIONS = ["new", "like_new", "good", "fair", "poor"]
CONDITION_MULT = {"new": 1.0, "like_new": 0.92, "good": 0.80, "fair": 0.62, "poor": 0.42}

# category -> (base_retention, k per year, condition sensitivity, price range, items)
CATEGORIES = {
    "textbooks": dict(
        base=0.62, k=0.38, cond=0.6, price=(350, 1800),
        items=["Engineering Mathematics Vol 1", "Data Structures Textbook", "Physics for Engineers",
               "Organic Chemistry Guide", "Thermodynamics Handbook", "Digital Electronics Text",
               "Operating Systems Concepts", "Engineering Drawing Book", "Signals and Systems",
               "Discrete Maths Notes Set"]),
    "calculators": dict(
        base=0.72, k=0.11, cond=0.8, price=(500, 2200),
        items=["Scientific Calculator fx-991", "Scientific Calculator fx-82", "Graphing Calculator",
               "Programmable Calculator", "Basic Calculator Pro", "Scientific Calculator Classwiz"]),
    "cycles": dict(
        base=0.66, k=0.17, cond=1.2, price=(3500, 14000),
        items=["Geared Cycle 21-speed", "City Cycle Single Speed", "Mountain Bike 26in",
               "Hybrid Cycle", "Ladies Cycle", "Foldable Cycle"]),
    "lab_coats": dict(
        base=0.55, k=0.25, cond=0.7, price=(250, 700),
        items=["Lab Coat (White)", "Lab Coat with Name Pocket", "Chemistry Lab Coat", "Workshop Apron"]),
    "hostel_essentials": dict(
        base=0.58, k=0.22, cond=1.0, price=(400, 3500),
        items=["Study Table Lamp", "Bucket and Mug Set", "Extension Board", "Mini Table Fan",
               "Foldable Study Desk", "Electric Kettle", "Hostel Mattress", "Storage Trunk"]),
    "electronics": dict(
        base=0.50, k=0.30, cond=1.1, price=(600, 6000),
        items=["Wired Earphones", "Bluetooth Speaker", "Power Bank 10000mAh", "Mechanical Keyboard",
               "Wireless Mouse", "USB Hub", "Laptop Stand", "Webcam HD"]),
}

# Month demand multiplier (juniors arrive in July/Aug; farewell season dips prices)
SEASON = {1: 0.97, 2: 0.96, 3: 0.95, 4: 0.93, 5: 0.92, 6: 0.98, 7: 1.08, 8: 1.10,
          9: 1.03, 10: 1.00, 11: 0.99, 12: 0.97}


def round_price(x: float, step: int = 10) -> int:
    return int(round(x / step) * step)


def make_row(rng: random.Random, i: int) -> dict:
    cat = rng.choices(list(CATEGORIES), weights=[24, 20, 16, 12, 14, 14])[0]
    cfg = CATEGORIES[cat]
    item = rng.choice(cfg["items"])
    age = round(rng.choice([0.5, 1, 1, 1.5, 2, 2, 2.5, 3, 3, 4, 5]) + rng.uniform(-0.2, 0.2), 1)
    age = max(0.3, age)
    condition = rng.choices(CONDITIONS, weights=[4, 20, 38, 26, 12])[0]
    original = round_price(rng.uniform(*cfg["price"]), 10)
    month = rng.randint(1, 12)

    # condition effect scaled per category
    cond_mult = CONDITION_MULT[condition] ** cfg["cond"]
    retention = cfg["base"] * math.exp(-cfg["k"] * age) * cond_mult
    # textbooks: new edition every ~3 years causes an extra cliff
    if cat == "textbooks" and age >= 3:
        retention *= 0.55
    retention *= SEASON[month]
    retention *= math.exp(rng.gauss(0, 0.07))  # noise
    retention = min(retention, 0.95)  # never exceed original
    sold = max(round_price(original * retention, 10), 20)
    sold = min(sold, original)

    return dict(
        id=i + 1, item_name=item, category=cat, condition=condition, age_years=age,
        original_price=original, sold_price=sold, sold_month=month,
    )


def main():
    rng = random.Random(SEED)
    rows = [make_row(rng, i) for i in range(N)]
    out = Path(__file__).parent / "listings.csv"
    with out.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    print(f"Wrote {len(rows)} listings to {out}")


if __name__ == "__main__":
    main()
