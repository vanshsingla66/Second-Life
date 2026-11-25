import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";

import { Card } from "@/components/ui";
import { CONDITION_LABEL, inr } from "@/lib/format";
import type { Confidence, Condition, PriceSuggestion } from "@/lib/types";

const CONF: Record<Confidence, { label: string; bg: string; text: string }> = {
  high: { label: "High confidence", bg: "bg-brand-100 dark:bg-brand-900/60", text: "text-brand-800 dark:text-brand-200" },
  medium: { label: "Medium confidence", bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-800 dark:text-amber-200" },
  low: { label: "Low confidence", bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-800 dark:text-red-200" },
};

export function ConfidencePill({ level }: { level: Confidence }) {
  const c = CONF[level];
  return (
    <View className={`self-start rounded-full px-2.5 py-1 ${c.bg}`}>
      <Text className={`text-[12px] font-bold ${c.text}`}>{c.label}</Text>
    </View>
  );
}

/** The "why this price?" explanation: plain-language reasons plus the closest past sales. */
export function WhyThisPrice({ pricing }: { pricing: PriceSuggestion }) {
  return (
    <View>
      {pricing.explanation.map((line, i) => (
        <View key={i} className="mb-2 flex-row gap-2">
          <Ionicons name="leaf" size={16} color="#22a355" style={{ marginTop: 3 }} />
          <Text className="flex-1 text-[15px] leading-[21px] text-ink dark:text-white/90">{line}</Text>
        </View>
      ))}
      {pricing.comparables.length > 0 && (
        <>
          <Text className="mb-1.5 mt-3 text-[12px] font-bold uppercase tracking-widest text-ink/50 dark:text-white/50">Similar past sales</Text>
          {pricing.comparables.map((c, i) => (
            <View key={i} className="flex-row items-center justify-between border-t border-brand-100 py-2 dark:border-night-line">
              <View className="flex-1 pr-3">
                <Text className="text-[14px] font-semibold text-ink dark:text-white" numberOfLines={1}>{c.item_name}</Text>
                <Text className="text-[12px] text-ink/50 dark:text-white/50">
                  {CONDITION_LABEL[c.condition as Condition] ?? c.condition} · {c.age_years} yrs · was {inr(c.original_price)}
                </Text>
              </View>
              <Text className="text-[15px] font-extrabold text-brand-700 dark:text-brand-300">{inr(c.sold_price)}</Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

export function PriceSuggestionCard({ suggestion, loading }: { suggestion?: PriceSuggestion; loading?: boolean }) {
  const [open, setOpen] = React.useState(true);
  if (!suggestion) return null;
  return (
    <Card className={`border-brand-300 bg-brand-50 dark:border-brand-700 dark:bg-brand-900/30 ${loading ? "opacity-60" : ""}`}>
      <View className="flex-row items-center justify-between">
        <Text className="text-[12px] font-bold uppercase tracking-widest text-brand-700 dark:text-brand-300">Suggested fair price</Text>
        <ConfidencePill level={suggestion.confidence} />
      </View>
      <Text className="mt-1 text-[44px] font-extrabold leading-[50px] text-brand-700 dark:text-brand-200">{inr(suggestion.suggested_price)}</Text>
      <Text className="text-[14px] text-ink/70 dark:text-white/70">Most sales land between {inr(suggestion.low)} and {inr(suggestion.high)}</Text>
      <Text onPress={() => setOpen((o) => !o)} className="mb-2 mt-3 text-[14px] font-bold text-brand-700 dark:text-brand-300">
        {open ? "Hide" : "Show"} why this price {open ? "▲" : "▼"}
      </Text>
      {open && <WhyThisPrice pricing={suggestion} />}
    </Card>
  );
}
