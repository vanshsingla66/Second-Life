import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { useConfirm } from "@/components/Confirm";
import { Button, Card, ErrorState, Header, RowSkeleton, Screen, SectionTitle, TrustBadge } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { useStats } from "@/lib/queries";

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <View className="flex-1 items-center rounded-2xl bg-brand-50 py-3 dark:bg-brand-900/30">
      <Text className="text-[22px] font-extrabold text-brand-700 dark:text-brand-200">{value}</Text>
      <Text className="text-[12px] text-ink/60 dark:text-white/60">{label}</Text>
    </View>
  );
}

function Row({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="flex-row items-center gap-3 border-b border-brand-100 py-3.5 dark:border-night-line">
      <Ionicons name={icon} size={22} color="#22a355" />
      <Text className="flex-1 text-[16px] font-semibold text-ink dark:text-white">{label}</Text>
      <Ionicons name="chevron-forward" size={18} color="#999" />
    </Pressable>
  );
}

export default function Profile() {
  const { user, logout } = useAuth();
  const q = useStats();
  const [busy, setBusy] = useState(false);

  async function doLogout() { setBusy(true); await logout(); }
  const confirm = useConfirm();
  async function askLogout() {
    if (await confirm({ title: "Sign out?", message: "You'll need to sign in again.", yes: "Sign out", emoji: "👋" })) doLogout();
  }

  const s = q.data;
  const progress = s ? (s.trust.next_badge ? s.trust.score / (s.trust.score + s.trust.points_to_next) : 1) : 0;

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Header title="Profile" />
      <Card className="flex-row items-center gap-4">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-500">
          <Text className="text-[28px] font-extrabold text-white">{user?.name[0]?.toUpperCase()}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-[20px] font-extrabold text-ink dark:text-white">{user?.name}</Text>
          <Text className="text-[13px] text-ink/60 dark:text-white/60">{user?.email}</Text>
          {s && <View className="mt-1.5"><TrustBadge trust={s.trust} /></View>}
        </View>
      </Card>

      {q.isLoading ? <View className="mt-4"><RowSkeleton count={2} /></View> : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : s && (
        <>
          <SectionTitle>Your stats</SectionTitle>
          <View className="flex-row gap-3">
            <Stat value={s.trust.items_sold} label="Items sold" />
            <Stat value={s.trust.swaps_done} label="Swaps done" />
            <Stat value={`${Math.round(s.trust.response_rate * 100)}%`} label="Reply rate" />
          </View>
          <Card className="mt-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-[15px] font-bold text-ink dark:text-white">Trust score: {s.trust.score}</Text>
              <Text className="text-[12px] text-ink/50 dark:text-white/50">
                {s.trust.next_badge ? `${s.trust.points_to_next} pts to ${s.trust.next_badge}` : "Top badge reached 🎉"}
              </Text>
            </View>
            <View className="mt-2 h-2.5 overflow-hidden rounded-full bg-brand-100 dark:bg-night-line">
              <View style={{ width: `${Math.round(progress * 100)}%` }} className="h-full rounded-full bg-brand-500" />
            </View>
            <Text className="mt-2 text-[12px] text-ink/50 dark:text-white/50">
              Earn points by selling items (1 each), completing swaps (2 each) and replying quickly.
            </Text>
          </Card>

          <SectionTitle>Your green impact 🌍</SectionTitle>
          <Card className="flex-row gap-3 bg-brand-600 dark:bg-brand-700">
            <View className="flex-1"><Text className="text-[26px] font-extrabold text-white">{s.green.waste_kg} kg</Text><Text className="text-[13px] text-white/80">kept out of the bin</Text></View>
            <View className="flex-1"><Text className="text-[26px] font-extrabold text-white">{s.green.co2_kg} kg</Text><Text className="text-[13px] text-white/80">CO₂ avoided (est.)</Text></View>
          </Card>
        </>
      )}

      <View className="mt-5">
        <Row icon="chatbubbles-outline" label="Messages" onPress={() => router.push("/messages")} />
        <Row icon="cube-outline" label="My listings" onPress={() => router.push("/my-listings")} />
        <Row icon="stats-chart-outline" label="Price insights" onPress={() => router.push("/insights")} />
        <Row icon="sparkles-outline" label="Ask GREEN Assistant (AI)" onPress={() => router.push("/assistant")} />
      </View>
      <View className="mt-6"><Button title="Sign out" variant="danger" icon="log-out" onPress={askLogout} loading={busy} /></View>
    </Screen>
  );
}
