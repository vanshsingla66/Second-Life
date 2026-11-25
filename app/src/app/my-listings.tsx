import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useConfirm } from "@/components/Confirm";

import { useToast } from "@/components/Toast";
import { Button, Card, Chip, EmptyState, ErrorState, FairPill, Header, ListingImage, RowSkeleton, Screen } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { inr } from "@/lib/format";
import type { Listing } from "@/lib/types";

export default function MyListings() {
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"active" | "done">("active");
  const q = useQuery({ queryKey: ["my-listings"], queryFn: api.myListings });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["my-listings"] }); qc.invalidateQueries({ queryKey: ["listings"] }); qc.invalidateQueries({ queryKey: ["stats"] }); };
  const sold = useMutation({ mutationFn: api.markSold, onSuccess: () => { invalidate(); toast.show("Marked as sold 🎉", "success"); }, onError: (e) => toast.show(errorMessage(e), "error") });
  const del = useMutation({ mutationFn: api.deleteListing, onSuccess: () => { invalidate(); toast.show("Listing deleted", "success"); }, onError: (e) => toast.show(errorMessage(e), "error") });

  const rows = (q.data ?? []).filter((l) => (tab === "active" ? l.status === "active" : l.status !== "active"));

  const confirm = useConfirm();
  async function askDelete(l: Listing) {
    if (await confirm({ title: "Delete this listing?", message: l.title, yes: "Delete", emoji: "🗑️" })) del.mutate(l.id);
  }

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Header title="My listings" onBack />
      <View className="mb-3 flex-row">
        <Chip label="Active" selected={tab === "active"} onPress={() => setTab("active")} />
        <Chip label="Sold & swapped" selected={tab === "done"} onPress={() => setTab("done")} />
      </View>
      {q.isLoading ? <RowSkeleton /> : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> :
        rows.length === 0 ? (
          <EmptyState emoji={tab === "active" ? "📦" : "🏆"} title={tab === "active" ? "No active listings" : "Nothing sold yet"}
            body={tab === "active" ? "List something and give it a second life." : "Once you sell or swap an item it will show up here."}
            action={tab === "active" ? <Button title="Sell an item" icon="add" onPress={() => router.push("/sell")} /> : undefined} />
        ) : (
          <View className="gap-3">
            {rows.map((l) => (
              <Card key={l.id}>
                <Pressable onPress={() => router.push(`/listing/${l.id}`)} className="flex-row gap-3">
                  <View style={{ width: 84 }}><ListingImage listing={l} height={84} radius={16} /></View>
                  <View className="flex-1">
                    <Text className="text-[16px] font-bold text-ink dark:text-white" numberOfLines={2}>{l.title}</Text>
                    <Text className="text-[18px] font-extrabold text-brand-700 dark:text-brand-300">{inr(l.price)}</Text>
                    <View className="mt-1 flex-row items-center gap-2">
                      {l.status === "active" ? <FairPill label={l.fair_label} /> : (
                        <View className="rounded-full bg-ink/10 px-2.5 py-1 dark:bg-white/15"><Text className="text-[12px] font-bold uppercase text-ink/70 dark:text-white/70">{l.status}</Text></View>
                      )}
                    </View>
                  </View>
                </Pressable>
                {l.status === "active" && (
                  <View className="mt-3 flex-row gap-2">
                    <View className="flex-1"><Button small title="Edit" icon="create" variant="secondary" onPress={() => router.push(`/edit-listing/${l.id}`)} /></View>
                    <View className="flex-1"><Button small title="Sold" icon="checkmark-done" variant="secondary" loading={sold.isPending && sold.variables === l.id} onPress={() => sold.mutate(l.id)} /></View>
                    <Button small title="" label={`Delete ${l.title}`} icon="trash" variant="danger" loading={del.isPending && del.variables === l.id} onPress={() => askDelete(l)} />
                  </View>
                )}
              </Card>
            ))}
          </View>
        )}
    </Screen>
  );
}
