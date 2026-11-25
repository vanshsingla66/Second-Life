import type { Condition, FairLabel } from "./types";

export const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export const CONDITION_LABEL: Record<Condition, string> = {
  new: "New", like_new: "Like new", good: "Good", fair: "Fair", poor: "Poor",
};

export const CATEGORY_EMOJI: Record<string, string> = {
  textbooks: "📚", calculators: "🧮", cycles: "🚲", lab_coats: "🥼", hostel_essentials: "🛏️", electronics: "🎧",
};
/** Soft background per category for listings without a photo: [light, dark]. */
export const CATEGORY_TINT: Record<string, [string, string]> = {
  textbooks: ["#FFF1CC", "#3A2F12"], calculators: ["#E3E8FF", "#1F2447"], cycles: ["#DBF1FF", "#12303F"],
  lab_coats: ["#FFE1EA", "#3F1A27"], hostel_essentials: ["#EBE1FF", "#2A1F47"], electronics: ["#D5F5EE", "#10362F"],
};
export const tintFor = (category: string, dark: boolean) => (CATEGORY_TINT[category] ?? ["#D7F4DE", "#12522E"])[dark ? 1 : 0];

const ITEM_EMOJI: [RegExp, string][] = [
  [/laptop stand/i, "💻"], [/mouse/i, "🖱️"], [/keyboard/i, "⌨️"], [/speaker/i, "🔊"], [/power ?bank/i, "🔋"],
  [/earphone|headphone/i, "🎧"], [/webcam/i, "📷"], [/usb/i, "🔌"], [/lamp/i, "💡"], [/fan/i, "🌀"], [/kettle/i, "☕"],
  [/mattress/i, "🛏️"], [/desk|table/i, "🪑"], [/bucket|mug/i, "🪣"], [/extension/i, "🔌"], [/trunk/i, "🧳"],
  [/graphing|programmable/i, "🧮"], [/calculator/i, "🧮"], [/foldable cycle|folding/i, "🚲"], [/lab coat|apron/i, "🥼"],
];
/** Emoji for a specific item (by title), falling back to its category. */
export const emojiForItem = (title: string, category: string) =>
  ITEM_EMOJI.find(([re]) => re.test(title))?.[1] ?? emojiFor(category);

export const emojiFor = (category: string) => CATEGORY_EMOJI[category] ?? "📦";

export const FAIR: Record<FairLabel, { label: string; emoji: string; text: string; bg: string; fill: string; pct: number }> = {
  steal: { label: "Steal", emoji: "🔥", text: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-100 dark:bg-emerald-900/50", fill: "bg-emerald-500", pct: 18 },
  fair: { label: "Fair price", emoji: "✅", text: "text-brand-700 dark:text-brand-200", bg: "bg-brand-100 dark:bg-brand-900/60", fill: "bg-brand-500", pct: 50 },
  pricey: { label: "Pricey", emoji: "💸", text: "text-amber-800 dark:text-amber-300", bg: "bg-amber-100 dark:bg-amber-900/40", fill: "bg-amber-500", pct: 85 },
};

export function timeAgo(iso: string): string {
  const d = new Date(iso.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export const ageLabel = (y: number) => `${y} yr${y === 1 ? "" : "s"} old`;

export function parseNumber(s: string): number | null {
  const n = Number(s.replace(/[,₹\s]/g, ""));
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
}
export const categoryLabel = (c: string) => c.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
