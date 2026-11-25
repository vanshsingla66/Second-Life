import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useEffect } from "react";
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, TextInput, TextInputProps, View, ViewProps, useColorScheme,
} from "react-native";
import Animated, {
  FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { assetUrl } from "@/lib/config";
import { CONDITION_LABEL, FAIR, ageLabel, emojiFor, emojiForItem, inr, tintFor } from "@/lib/format";
import type { Badge, FairLabel, Listing, Trust } from "@/lib/types";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];
export const useIsDark = () => useColorScheme() === "dark";

// ---------- layout ----------
export function Screen({
  children, scroll = true, refreshing, onRefresh, edges = ["top"], padded = true, bottomPad = 110,
}: {
  children: React.ReactNode; scroll?: boolean; refreshing?: boolean; onRefresh?: () => void;
  edges?: ("top" | "bottom" | "left" | "right")[]; padded?: boolean; bottomPad?: number;
}) {
  return (
    <SafeAreaView edges={edges} className="flex-1 bg-cream dark:bg-night">
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: padded ? 16 : 0, paddingBottom: bottomPad, flexGrow: 1 }}
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor="#22a355" /> : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View className={`flex-1 ${padded ? "px-4" : ""}`}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Card({ children, className = "", ...rest }: ViewProps & { className?: string }) {
  return (
    <View className={`rounded-3xl border border-brand-100 bg-white p-4 dark:border-night-line dark:bg-night-card ${className}`} {...rest}>
      {children}
    </View>
  );
}

export function Header({ title, subtitle, onBack, right }: { title: string; subtitle?: string; onBack?: boolean; right?: React.ReactNode }) {
  return (
    <View className="flex-row items-center gap-3 pb-3 pt-2">
      {onBack && (
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} hitSlop={10}
          className="h-10 w-10 items-center justify-center rounded-full bg-white dark:bg-night-card" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={22} color="#22a355" />
        </Pressable>
      )}
      <View className="flex-1">
        <Text className="text-[26px] font-extrabold text-ink dark:text-white" numberOfLines={1}>{title}</Text>
        {subtitle ? <Text className="text-[14px] text-ink/60 dark:text-white/60">{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <Text className="mb-2 mt-5 text-[13px] font-bold uppercase tracking-widest text-brand-700 dark:text-brand-300">{children}</Text>
);

// ---------- controls ----------
export function Button({
  title, onPress, variant = "primary", loading, disabled, icon, small, label,
}: {
  title: string; onPress?: () => void; variant?: "primary" | "secondary" | "ghost" | "danger"; loading?: boolean;
  disabled?: boolean; icon?: IconName; small?: boolean; label?: string;
}) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const off = disabled || loading;
  const look = {
    primary: "bg-brand-500 active:bg-brand-600",
    secondary: "bg-white border border-brand-200 dark:bg-night-card dark:border-night-line",
    ghost: "bg-transparent",
    danger: "bg-red-50 border border-red-200 dark:bg-red-950/40 dark:border-red-900",
  }[variant];
  const textLook = {
    primary: "text-white", secondary: "text-ink dark:text-white", ghost: "text-brand-700 dark:text-brand-300",
    danger: "text-red-700 dark:text-red-300",
  }[variant];
  const iconColor = variant === "primary" ? "#fff" : variant === "danger" ? "#b91c1c" : "#22a355";
  return (
    <Animated.View style={style}>
      <Pressable
        accessibilityRole="button" accessibilityLabel={label ?? (title || undefined)} accessibilityState={{ disabled: !!off }} disabled={off} onPress={onPress}
        onPressIn={() => { scale.value = withSpring(0.96, { damping: 15 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 12 }); }}
        className={`flex-row items-center justify-center gap-2 rounded-2xl ${small ? "px-4 py-2.5" : "px-5 py-4"} ${look} ${off ? "opacity-50" : ""}`}
      >
        {loading ? <ActivityIndicator color={variant === "primary" ? "#fff" : "#22a355"} /> : icon ? <Ionicons name={icon} size={18} color={iconColor} /> : null}
        <Text className={`${small ? "text-[14px]" : "text-[16px]"} font-bold ${textLook}`}>{title}</Text>
      </Pressable>
    </Animated.View>
  );
}

export function Field({
  label, error, hint, ...rest
}: TextInputProps & { label: string; error?: string | null; hint?: string }) {
  const dark = useIsDark();
  return (
    <View className="mb-3">
      <Text className="mb-1.5 text-[13px] font-bold text-ink/70 dark:text-white/70">{label}</Text>
      <TextInput
        placeholderTextColor={dark ? "#ffffff55" : "#14231a55"} accessibilityLabel={label}
        className={`rounded-2xl border bg-white px-4 py-3.5 text-[16px] text-ink dark:bg-night-card dark:text-white ${error ? "border-red-400" : "border-brand-100 dark:border-night-line"}`}
        {...rest}
      />
      {error ? <Text className="mt-1 text-[13px] font-medium text-red-600 dark:text-red-400">{error}</Text>
        : hint ? <Text className="mt-1 text-[12px] text-ink/50 dark:text-white/50">{hint}</Text> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress, emoji, dot }: { label: string; selected?: boolean; onPress?: () => void; emoji?: string; dot?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!selected }}
      className={`mr-2 flex-row items-center gap-1.5 rounded-full border px-4 py-2 ${selected ? "border-brand-500 bg-brand-500" : "border-brand-100 bg-white dark:border-night-line dark:bg-night-card"}`}>
      {dot ? <View style={{ backgroundColor: dot, opacity: selected ? 1 : 0.35 }} className="h-3 w-3 rounded-full border border-white/70" /> : null}
      {emoji ? <Text className="text-[14px]">{emoji}</Text> : null}
      <Text className={`text-[14px] font-semibold ${selected ? "text-white" : "text-ink dark:text-white"}`}>{label}</Text>
    </Pressable>
  );
}

// ---------- badges and meters ----------
const BADGE_STYLE: Record<Badge, { emoji: string; label: string; bg: string; text: string }> = {
  bronze: { emoji: "🥉", label: "Bronze seller", bg: "bg-orange-100 dark:bg-orange-900/40", text: "text-orange-800 dark:text-orange-200" },
  silver: { emoji: "🥈", label: "Silver seller", bg: "bg-slate-200 dark:bg-slate-700", text: "text-slate-700 dark:text-slate-100" },
  gold: { emoji: "🥇", label: "Gold seller", bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-800 dark:text-amber-200" },
};

export function TrustBadge({ trust, compact }: { trust: Trust; compact?: boolean }) {
  const s = BADGE_STYLE[trust.badge];
  return (
    <View className={`flex-row items-center gap-1 self-start rounded-full px-2.5 py-1 ${s.bg}`}>
      <Text className="text-[12px]">{s.emoji}</Text>
      <Text className={`text-[12px] font-bold ${s.text}`}>{compact ? trust.badge[0].toUpperCase() + trust.badge.slice(1) : s.label}</Text>
    </View>
  );
}

export function FairPill({ label }: { label: FairLabel }) {
  const f = FAIR[label];
  return (
    <View className={`flex-row items-center gap-1 self-start rounded-full px-2.5 py-1 ${f.bg}`}>
      <Text className="text-[12px]">{f.emoji}</Text>
      <Text className={`text-[12px] font-bold ${f.text}`}>{f.label}</Text>
    </View>
  );
}

/** Fair-price meter: a track with a marker showing where the asking price sits vs the suggested price. */
export function FairMeter({ price, suggested, low, high }: { price: number; suggested: number; low?: number; high?: number }) {
  const ratio = suggested > 0 ? price / suggested : 1;
  const pct = Math.min(Math.max(((ratio - 0.6) / 0.8) * 100, 4), 96); // 0.6x .. 1.4x
  const marker = useSharedValue(50);
  useEffect(() => { marker.value = withSpring(pct, { damping: 14 }); }, [pct, marker]);
  const style = useAnimatedStyle(() => ({ left: `${marker.value}%` }));
  return (
    <View>
      <View className="h-3 flex-row overflow-hidden rounded-full">
        {/* zone widths match the server labels: steal <= 0.9x, fair <= 1.12x, on a 0.6x..1.4x scale */}
        <View style={{ flex: 37.5 }} className="bg-emerald-400" /><View style={{ flex: 27.5 }} className="bg-brand-300" /><View style={{ flex: 35 }} className="bg-amber-300" />
      </View>
      <Animated.View style={[{ position: "absolute", top: -3, width: 18, marginLeft: -9 }, style]}>
        <View className="h-[18px] w-[18px] rounded-full border-[3px] border-white bg-ink dark:border-night dark:bg-white" />
      </Animated.View>
      <View className="mt-2 flex-row justify-between">
        <Text className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">Steal</Text>
        <Text className="text-[11px] font-semibold text-brand-700 dark:text-brand-300">
          {low && high ? `Fair ${inr(low)}–${inr(high)}` : "Fair"}
        </Text>
        <Text className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">Pricey</Text>
      </View>
    </View>
  );
}

// ---------- listing visuals ----------
export function ListingImage({ listing, height = 150, radius = 20 }: { listing: Pick<Listing, "image_url" | "category" | "title">; height?: number; radius?: number }) {
  const uri = assetUrl(listing.image_url);
  const dark = useIsDark();
  if (uri) {
    return <Image source={{ uri }} style={{ width: "100%", height, borderRadius: radius }} contentFit="cover" transition={200}
      accessibilityLabel={listing.title} />;
  }
  return (
    <View style={{ height, borderRadius: radius, backgroundColor: tintFor(listing.category, dark), overflow: "hidden" }}
      className="items-center justify-center">
      <Text style={{ position: "absolute", right: -height * 0.08, bottom: -height * 0.12, fontSize: height * 0.7, opacity: 0.12 }}>
        {emojiForItem(listing.title, listing.category)}
      </Text>
      <Text style={{ fontSize: height * 0.4 }}>{emojiForItem(listing.title, listing.category)}</Text>
    </View>
  );
}

export function ListingCard({ listing, index = 0, onPress }: { listing: Listing; index?: number; onPress?: () => void }) {
  return (
    // Plain View carries the sizing: Reanimated's Animated.View drops flex styles on web.
    <View style={{ flex: 1, minWidth: 0 }}>
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 50).duration(300)}>
      <Pressable onPress={onPress ?? (() => router.push(`/listing/${listing.id}`))} accessibilityRole="button"
        accessibilityLabel={`${listing.title}, ${inr(listing.price)}`}
        className="rounded-3xl border border-brand-100 bg-white p-2.5 active:opacity-80 dark:border-night-line dark:bg-night-card">
        <ListingImage listing={listing} height={118} radius={18} />
        <View className="px-1 pb-1 pt-2.5">
          <Text className="text-[15px] font-bold text-ink dark:text-white" numberOfLines={2}>{listing.title}</Text>
          <View className="mt-1 flex-row items-baseline gap-2">
            <Text className="text-[19px] font-extrabold text-brand-700 dark:text-brand-300">{inr(listing.price)}</Text>
            <Text className="text-[12px] text-ink/40 line-through dark:text-white/40">{inr(listing.original_price)}</Text>
          </View>
          <Text className="mt-0.5 text-[12px] text-ink/60 dark:text-white/60">
            {CONDITION_LABEL[listing.condition]} · {ageLabel(listing.age_years)}
          </Text>
          <View className="mt-2"><FairPill label={listing.fair_label} /></View>
        </View>
      </Pressable>
    </Animated.View>
    </View>
  );
}

// ---------- states ----------
export function EmptyState({ emoji, title, body, action }: { emoji: string; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <View className="items-center px-6 py-14">
      <Text style={{ fontSize: 64 }}>{emoji}</Text>
      <Text className="mt-3 text-center text-[20px] font-extrabold text-ink dark:text-white">{title}</Text>
      {body ? <Text className="mt-1.5 text-center text-[15px] leading-5 text-ink/60 dark:text-white/60">{body}</Text> : null}
      {action ? <View className="mt-5 w-full max-w-[260px]">{action}</View> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState emoji="🌧️" title="That didn't work" body={message}
      action={onRetry ? <Button title="Try again" onPress={onRetry} icon="refresh" /> : undefined} />
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  const o = useSharedValue(0.5);
  useEffect(() => { o.value = withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0.5, { duration: 700 })), -1); }, [o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  // Reanimated's Animated.View ignores className on web, so the pulse is applied to a wrapper and the sizing lives inside.
  return <Animated.View style={style}><View className={`rounded-2xl bg-brand-100 dark:bg-night-line ${className}`} /></Animated.View>;
}

export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View className="flex-row flex-wrap gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ width: "48%" }} className="rounded-3xl border border-brand-100 bg-white p-2.5 dark:border-night-line dark:bg-night-card">
          <Skeleton className="h-[118px]" /><Skeleton className="mt-3 h-4 w-3/4" /><Skeleton className="mt-2 h-5 w-1/2" />
        </View>
      ))}
    </View>
  );
}

export function RowSkeleton({ count = 3 }: { count?: number }) {
  return <View className="gap-3">{Array.from({ length: count }).map((_, i) => <Skeleton key={i} className="h-24" />)}</View>;
}
