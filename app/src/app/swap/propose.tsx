import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useToast } from "@/components/Toast";
import { Button, Card, EmptyState, ErrorState, Header, ListingImage, RowSkeleton, Screen, SectionTitle } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { inr } from "@/lib/format";

export default function ProposeSwap() {
  const { requested } = useLocalSearchParams<{ requested: string }>();
  const requestedId = Number(requested);
  const toast = useToast();
  const qc = useQueryClient();
  const [offeredId, setOfferedId] = useState<number | null>(null);

  const target = useQuery({ queryKey: ["listing", requestedId], queryFn: () => api.listing(requestedId) });
  const mine = useQuery({ queryKey: ["my-listings"], queryFn: api.myListings });
  const active = (mine.data ?? []).filter((l) => l.status === "active");
  const quote = useQuery({
    queryKey: ["swap-quote", offeredId, requestedId], enabled: offeredId !== null,
    queryFn: () => api.swapQuote(offeredId!, requestedId),
  });

  const propose = useMutation({
    mutationFn: () => api.proposeSwap(offeredId!, requestedId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["swaps"] }); toast.show("Swap proposed! 🔄", "success"); router.dismissAll?.(); router.replace("/swaps"); },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  const t = target.data;
  const topup = quote.data?.cash_topup ?? 0;

  return (
    <Screen edges={["top", "bottom"]}>
      <Header title="Propose a swap" subtitle="We price both items so it's fair" onBack />
      {target.isLoading || mine.isLoading ? <RowSkeleton /> : target.isError ? <ErrorState message={errorMessage(target.error)} onRetry={() => target.refetch()} /> : t && (
        <>
          <SectionTitle>You want</SectionTitle>
          <Card className="flex-row items-center gap-3">
            <View style={{ width: 72 }}><ListingImage listing={t} height={72} radius={14} /></View>
            <View className="flex-1">
              <Text className="text-[16px] font-bold text-ink dark:text-white" numberOfLines={2}>{t.title}</Text>
              <Text className="text-[13px] text-ink/60 dark:text-white/60">Fair value ~{inr(t.suggested_price)}</Text>
            </View>
          </Card>

          <SectionTitle>You offer</SectionTitle>
          {active.length === 0 ? (
            <EmptyState emoji="🎁" title="You've nothing to offer yet" body="List an item first, then you can trade it."
              action={<Button title="Sell an item" icon="add" onPress={() => router.replace("/sell")} />} />
          ) : (
            <View className="gap-2">
              {active.map((l) => {
                const on = offeredId === l.id;
                return (
                  <Pressable key={l.id} onPress={() => setOfferedId(l.id)} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                    <Card className={`flex-row items-center gap-3 ${on ? "border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-900/30" : ""}`}>
                      <View style={{ width: 56 }}><ListingImage listing={l} height={56} radius={12} /></View>
                      <View className="flex-1">
                        <Text className="text-[15px] font-bold text-ink dark:text-white" numberOfLines={1}>{l.title}</Text>
                        <Text className="text-[13px] text-ink/60 dark:text-white/60">Fair value ~{inr(l.suggested_price)}</Text>
                      </View>
                      <View className={`h-6 w-6 items-center justify-center rounded-full border-2 ${on ? "border-brand-500 bg-brand-500" : "border-brand-200 dark:border-night-line"}`}>
                        {on && <Text className="text-[12px] font-bold text-white">✓</Text>}
                      </View>
                    </Card>
                  </Pressable>
                );
              })}
            </View>
          )}

          {offeredId !== null && (
            <View className="mt-5">
              {quote.isLoading ? <RowSkeleton count={1} /> : quote.isError ? <ErrorState message={errorMessage(quote.error)} onRetry={() => quote.refetch()} /> : quote.data && (
                <Card className="border-brand-300 bg-brand-50 dark:border-brand-700 dark:bg-brand-900/30">
                  <Text className="text-[12px] font-bold uppercase tracking-widest text-brand-700 dark:text-brand-300">Fair swap</Text>
                  <Text className="mt-1 text-[22px] font-extrabold text-ink dark:text-white">
                    {topup === 0 ? "Even swap, no cash needed" : topup > 0 ? `Swap + you add ${inr(topup)}` : `Swap + they add ${inr(-topup)}`}
                  </Text>
                  <Text className="mt-1 text-[14px] text-ink/70 dark:text-white/70">{quote.data.summary}</Text>
                </Card>
              )}
              <View className="mt-4">
                <Button title="Send swap offer" icon="swap-horizontal" onPress={() => propose.mutate()} loading={propose.isPending} disabled={!quote.data} />
              </View>
            </View>
          )}
        </>
      )}
    </Screen>
  );
}
