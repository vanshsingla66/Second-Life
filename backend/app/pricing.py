"""Fair-price suggestion from the fitted per-category depreciation model."""
import csv
import json
import math
from datetime import datetime
from functools import lru_cache
from typing import Optional

from .config import DATA_DIR

CONDITION_LABEL = {"new": "new", "like_new": "like-new", "good": "good", "fair": "fair", "poor": "poor"}
CONDITION_RANK = {"new": 0, "like_new": 1, "good": 2, "fair": 3, "poor": 4}
CATEGORY_LABEL = {
    "textbooks": "Textbooks", "calculators": "Calculators", "cycles": "Cycles",
    "lab_coats": "Lab coats", "hostel_essentials": "Hostel essentials", "electronics": "Electronics",
}
MAX_RATIO = 0.98  # never suggest above the original price


@lru_cache(maxsize=1)
def load_model() -> dict:
    return json.loads((DATA_DIR / "model.json").read_text())


@lru_cache(maxsize=1)
def load_sales() -> list[dict]:
    with (DATA_DIR / "listings.csv").open() as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        r["age_years"] = float(r["age_years"])
        r["original_price"] = int(float(r["original_price"]))
        r["sold_price"] = int(float(r["sold_price"]))
    return rows


def categories() -> list[str]:
    return sorted(load_model()["categories"])


def conditions() -> list[str]:
    return list(load_model()["conditions"])


def _round_price(x: float) -> int:
    step = 5 if x < 200 else 10
    return max(int(round(x / step) * step), step)


def _ratio(m: dict, age: float, condition: str) -> float:
    z = m["intercept"] + m["age"] * age + m["condition"].get(condition, 0.0)
    if age >= 3:
        z += m.get("cliff", 0.0)
    return min(math.exp(z), MAX_RATIO)


def _label(category: str) -> str:
    return CATEGORY_LABEL.get(category, category.replace("_", " ").capitalize())


def _comparables(category: Optional[str], age: float, condition: str, use_global: bool, limit: int = 5):
    pool = load_sales() if use_global else [r for r in load_sales() if r["category"] == category]

    def dist(r):
        return abs(r["age_years"] - age) + 0.7 * abs(CONDITION_RANK[r["condition"]] - CONDITION_RANK[condition])

    return sorted(pool, key=dist)[:limit], pool


def suggest(category: str, condition: str, age_years: float, original_price: float, month: Optional[int] = None) -> dict:
    """Return the suggested fair price, a range, confidence, plain-language reasons and comparable sales."""
    model = load_model()
    cat_model = model["categories"].get(category)
    fallback = cat_model is None or cat_model["n"] < model["min_samples"]
    m = model["global"] if fallback else cat_model
    month = month or datetime.now().month

    ratio = _ratio(m, age_years, condition)
    season = float(model["season"].get(str(month), 1.0))
    season = min(max(season, 0.9), 1.12)
    seasoned = min(ratio * season, MAX_RATIO)

    base_price = original_price * seasoned
    low = original_price * min(seasoned * math.exp(m["resid_q25"]), MAX_RATIO)
    high = original_price * min(seasoned * math.exp(m["resid_q75"]), MAX_RATIO)
    suggested = _round_price(base_price)
    low_r, high_r = min(_round_price(low), suggested), max(_round_price(high), suggested)

    comps, pool = _comparables(category, age_years, condition, fallback)
    near = [r for r in pool if abs(r["age_years"] - age_years) <= 1.0 and r["condition"] == condition]
    if len(near) < 3:
        near = [r for r in pool if abs(r["age_years"] - age_years) <= 1.5]
    if near:
        sold_ratios = sorted(r["sold_price"] / r["original_price"] for r in near)
        median_ratio = sold_ratios[len(sold_ratios) // 2]
        median_price = _round_price(original_price * median_ratio)
    else:
        median_price = suggested

    # confidence
    extrapolating = age_years > 6
    if fallback:
        confidence = "low"
    elif m["n"] >= 20 and len(near) >= 3 and not extrapolating:
        confidence = "high"
    else:
        confidence = "medium" if not extrapolating else "low"

    label = _label(category)
    cond = CONDITION_LABEL.get(condition, condition)
    yrs = f"{age_years:g} year{'s' if age_years != 1 else ''}"
    explanation = []
    if fallback:
        explanation.append(
            f"We don't have enough past sales for '{category}' yet, so this uses the average depreciation "
            f"across all categories: items in {cond} condition keep about {ratio * 100:.0f}% of their price after {yrs}.")
    else:
        explanation.append(
            f"{label} in {cond} condition keep about {ratio * 100:.0f}% of their original price after {yrs} "
            f"(about {(1 - math.exp(m['age'])) * 100:.0f}% lost per year in this category).")
    if near:
        explanation.append(
            f"Based on {len(near)} similar past sale{'s' if len(near) != 1 else ''}, the median sold price "
            f"would be about ₹{median_price:,} for your item. The suggested range ₹{low_r:,}–₹{high_r:,} "
            f"covers the middle half of sales.")
    else:
        explanation.append(
            f"No close past sales match your item, so the range ₹{low_r:,}–₹{high_r:,} comes from the model's spread.")
    if abs(season - 1) >= 0.03:
        direction = "higher" if season > 1 else "lower"
        explanation.append(
            f"This month demand is {direction} than average, so the price is adjusted by {(season - 1) * 100:+.0f}%.")
    conf_reason = {
        "high": f"plenty of similar sales, {m['n']} in this category",
        "medium": "a decent number of sales, but few that are very close to your item",
        "low": "limited data for this combination, so treat it as a rough guide",
    }[confidence]
    explanation.append(f"Confidence: {confidence} ({conf_reason}).")

    return {
        "suggested_price": suggested,
        "low": low_r,
        "high": high_r,
        "confidence": confidence,
        "explanation": explanation,
        "comparables": [
            {"item_name": r["item_name"], "age_years": r["age_years"], "condition": r["condition"],
             "sold_price": r["sold_price"], "original_price": r["original_price"]}
            for r in comps
        ],
        "model": {"category": "all" if fallback else category, "samples": m["n"], "retention": round(ratio, 3)},
    }


def fair_label(price: int, suggested: int) -> str:
    """Fair-price meter used by the app: steal / fair / pricey."""
    if suggested <= 0:
        return "fair"
    r = price / suggested
    if r <= 0.9:
        return "steal"
    if r <= 1.12:
        return "fair"
    return "pricey"


def insights() -> dict:
    model = load_model()
    curves = {}
    for c, m in model["categories"].items():
        curves[c] = [{"age": a, "retention": round(_ratio(m, a, "good"), 3)} for a in (0, 0.5, 1, 1.5, 2, 3, 4, 5)]
    loss = sorted(
        ({"category": c, "label": _label(c), **v} for c, v in model["insights"].items()),
        key=lambda x: -x["yearly_loss_pct"])
    season = [{"month": int(k), "factor": v} for k, v in sorted(model["season"].items(), key=lambda kv: int(kv[0]))]
    fastest, slowest = loss[0], loss[-1]
    return {
        "headline": (f"{fastest['label']} lose about {fastest['yearly_loss_pct']:.0f}% of their value each year, "
                     f"while {slowest['label'].lower()} lose only {slowest['yearly_loss_pct']:.0f}%."),
        "curves": curves,
        "categories": loss,
        "season": season,
    }
