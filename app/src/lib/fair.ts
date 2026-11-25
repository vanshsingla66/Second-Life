import type { FairLabel } from "./types";

/** Same thresholds as backend/app/pricing.py fair_label(), used for the live label while a seller drags the slider. */
export function pricingFairLabel(price: number, suggested: number): FairLabel {
  if (suggested <= 0) return "fair";
  const r = price / suggested;
  if (r <= 0.9) return "steal";
  if (r <= 1.12) return "fair";
  return "pricey";
}
