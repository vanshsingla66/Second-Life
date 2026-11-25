"""Fit a log-linear depreciation model per category.

    log(sold / original) = intercept + b_age * age + b_cond[condition] (+ b_cliff * [age >= 3] for textbooks)

Reads listings.csv, writes model.json and prints an insight summary.
Run:  python fit_model.py
"""
import csv
import json
import math
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
CONDITIONS = ["new", "like_new", "good", "fair", "poor"]
BASE_COND = "good"
MIN_SAMPLES = 8
RIDGE = 1e-3


def load_rows():
    with (HERE / "listings.csv").open() as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        r["age_years"] = float(r["age_years"])
        r["original_price"] = float(r["original_price"])
        r["sold_price"] = float(r["sold_price"])
        r["sold_month"] = int(r["sold_month"])
    return rows


def design(rows, use_cliff):
    dummies = [c for c in CONDITIONS if c != BASE_COND]
    X, y = [], []
    for r in rows:
        x = [1.0, r["age_years"]]
        x += [1.0 if r["condition"] == c else 0.0 for c in dummies]
        if use_cliff:
            x.append(1.0 if r["age_years"] >= 3 else 0.0)
        X.append(x)
        y.append(math.log(r["sold_price"] / r["original_price"]))
    return np.array(X), np.array(y), dummies


def fit(rows, use_cliff=False):
    X, y, dummies = design(rows, use_cliff)
    # ridge on everything except the intercept for stability on small categories
    penalty = np.eye(X.shape[1]) * RIDGE
    penalty[0, 0] = 0
    beta = np.linalg.solve(X.T @ X + penalty, X.T @ y)
    resid = y - X @ beta
    model = {
        "n": len(rows),
        "intercept": float(beta[0]),
        "age": float(beta[1]),
        "condition": {BASE_COND: 0.0, **{c: float(beta[2 + i]) for i, c in enumerate(dummies)}},
        "cliff": float(beta[-1]) if use_cliff else 0.0,
        "resid_std": float(resid.std()),
        "resid_q25": float(np.quantile(resid, 0.25)),
        "resid_q75": float(np.quantile(resid, 0.75)),
    }
    return model


def predict_ratio(m, age, condition):
    z = m["intercept"] + m["age"] * age + m["condition"].get(condition, 0.0)
    if age >= 3:
        z += m["cliff"]
    return min(math.exp(z), 0.98)


def main():
    rows = load_rows()
    cats = sorted({r["category"] for r in rows})
    model = {"conditions": CONDITIONS, "base_condition": BASE_COND, "min_samples": MIN_SAMPLES,
             "categories": {}, "global": fit(rows)}
    insights = {}
    for c in cats:
        sub = [r for r in rows if r["category"] == c]
        if len(sub) < MIN_SAMPLES:
            continue
        m = fit(sub, use_cliff=(c == "textbooks"))
        model["categories"][c] = m
        r1 = predict_ratio(m, 1, BASE_COND)
        r2 = predict_ratio(m, 2, BASE_COND)
        r4 = predict_ratio(m, 4, BASE_COND)
        insights[c] = {
            "n": m["n"],
            "retention_1y": round(r1, 3), "retention_2y": round(r2, 3), "retention_4y": round(r4, 3),
            "yearly_loss_pct": round((1 - math.exp(m["age"])) * 100, 1),
        }
    model["insights"] = insights

    # seasonality insight: residual of each sale vs its category model, grouped by month
    by_month = {}
    for r in rows:
        m = model["categories"].get(r["category"], model["global"])
        z = m["intercept"] + m["age"] * r["age_years"] + m["condition"].get(r["condition"], 0.0)
        if r["age_years"] >= 3:
            z += m["cliff"]
        by_month.setdefault(r["sold_month"], []).append(math.log(r["sold_price"] / r["original_price"]) - z)
    model["season"] = {str(mth): round(float(math.exp(np.mean(v))), 3) for mth, v in sorted(by_month.items())}

    (HERE / "model.json").write_text(json.dumps(model, indent=2))
    print(f"Fitted {len(model['categories'])} category models on {len(rows)} sales -> model.json\n")
    print("Insights (good condition):")
    for c, i in sorted(insights.items(), key=lambda kv: -kv[1]["yearly_loss_pct"]):
        print(f"  {c:18s} loses ~{i['yearly_loss_pct']:>4}%/yr | keeps {i['retention_2y']*100:.0f}% after 2y "
              f"(n={i['n']})")
    peak = max(model["season"], key=lambda k: model["season"][k])
    print(f"\nSeason: prices peak in month {peak} (x{model['season'][peak]}) when juniors arrive.")


if __name__ == "__main__":
    main()
