import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useToast } from "@/components/Toast";
import { Button, Card, Chip, EmptyState, ErrorState, Header, ListingImage, RowSkeleton, Screen } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { inr, timeAgo } from "@/lib/format";
import type { Swap } from "@/lib/types";

const STATUS = {
  pending: { label: "Pending", bg: "bg-amber-100 dark:bg-amber-900/50", text: "text-amber-800 dark:text-amber-200" },
  accepted: { label: "Accepted", bg: "bg-brand-100 dark:bg-brand-900/60", text: "text-brand-800 dark:text-brand-200" },
  declined: { label: "Declined", bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-800 dark:text-red-200" },
} as const;

function StatusPill({ status }: { status: Swap["status"] }) {
  const s = STATUS[status];
  return <View className={`rounded-full px-2.5 py-1 ${s.bg}`}><Text className={`text-[12px] font-bold ${s.text}`}>{s.label}</Text></View>;
}

export default function Swaps() {
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"incoming" | "outgoing">("incoming");
  const q = useQuery({ queryKey: ["swaps"], queryFn: api.swaps });

  const done = (msg: string) => { qc.invalidateQueries({ queryKey: ["swaps"] }); qc.invalidateQueries({ queryKey: ["listings"] }); qc.invalidateQueries({ queryKey: ["my-listings"] }); qc.invalidateQueries({ queryKey: ["stats"] }); toast.show(msg, "success"); };
  const accept = useMutation({ mutationFn: api.acceptSwap, onSuccess: () => done("Swap accepted! 🔄"), onError: (e) => toast.show(errorMessage(e), "error") });
  const decline = useMutation({ mutationFn: api.declineSwap, onSuccess: () => done("Swap declined"), onError: (e) => toast.show(errorMessage(e), "error") });

  const rows = (q.data ?? []).filter((s) => s.direction === tab);
  const pendingIn = (q.data ?? []).filter((s) => s.direction === "incoming" && s.status === "pending").length;

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Header title="Swaps" subtitle="Trade items at a fair value" />
      <View className="mb-3 flex-row">
        <Chip label={pendingIn ? `Incoming (${pendingIn})` : "Incoming"} selected={tab === "incoming"} onPress={() => setTab("incoming")} />
        <Chip label="Outgoing" selected={tab === "outgoing"} onPress={() => setTab("outgoing")} />
      </View>
      {q.isLoading ? <RowSkeleton /> : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> :
        rows.length === 0 ? (
          <EmptyState emoji="🔄" title={tab === "incoming" ? "No swap offers yet" : "You haven't proposed a swap"}
            body={tab === "incoming" ? "When someone wants to trade with you, it shows up here." : "Open any listing and tap “Propose a swap”. We'll work out the fair cash top-up."}
            action={<Button title="Browse items" icon="storefront" onPress={() => router.push("/")} />} />
        ) : (
          <View className="gap-3">
            {rows.map((s) => (
              <Card key={s.id}>
                <View className="flex-row items-center justify-between">
                  <Text className="text-[13px] text-ink/50 dark:text-white/50">
                    {s.direction === "incoming" ? `From ${s.proposer.name}` : `To ${s.owner.name}`} · {timeAgo(s.created_at)}
                  </Text>
                  <StatusPill status={s.status} />
                </View>
                <View className="mt-3 flex-row items-center gap-2">
                  <Pressable className="flex-1" onPress={() => router.push(`/listing/${s.offered.id}`)}>
                    <ListingImage listing={s.offered} height={90} radius={16} />
                    <Text className="mt-1 text-[13px] font-bold text-ink dark:text-white" numberOfLines={1}>{s.offered.title}</Text>
                    <Text className="text-[12px] text-ink/60 dark:text-white/60">~{inr(s.offered.suggested_price)}</Text>
                  </Pressable>
                  <Text style={{ fontSize: 24 }}>🔄</Text>
                  <Pressable className="flex-1" onPress={() => router.push(`/listing/${s.requested.id}`)}>
                    <ListingImage listing={s.requested} height={90} radius={16} />
                    <Text className="mt-1 text-[13px] font-bold text-ink dark:text-white" numberOfLines={1}>{s.requested.title}</Text>
                    <Text className="text-[12px] text-ink/60 dark:text-white/60">~{inr(s.requested.suggested_price)}</Text>
                  </Pressable>
                </View>
                <View className="mt-3 rounded-2xl bg-brand-50 p-3 dark:bg-brand-900/30">
                  <Text className="text-[14px] font-semibold text-brand-800 dark:text-brand-200">{s.summary}</Text>
                </View>
                {s.direction === "incoming" && s.status === "pending" && (
                  <View className="mt-3 flex-row gap-3">
                    <View className="flex-1"><Button small title="Decline" variant="secondary" loading={decline.isPending && decline.variables === s.id} onPress={() => decline.mutate(s.id)} /></View>
                    <View className="flex-1"><Button small title="Accept" icon="checkmark" loading={accept.isPending && accept.variables === s.id} onPress={() => accept.mutate(s.id)} /></View>
                  </View>
                )}
              </Card>
            ))}
          </View>
        )}
    </Screen>
  );
}
