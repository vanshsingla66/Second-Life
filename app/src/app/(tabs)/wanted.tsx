import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { useToast } from "@/components/Toast";
import { Button, Card, EmptyState, ErrorState, Header, RowSkeleton, Screen } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { emojiFor, inr, timeAgo } from "@/lib/format";

export default function WantedBoard() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["wanted"], queryFn: api.wanted });
  const close = useMutation({
    mutationFn: api.closeWanted,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wanted"] }); toast.show("Request closed", "success"); },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Header title="Wanted" subtitle="What juniors are looking for" right={
        <Pressable onPress={() => router.push("/wanted/new")} accessibilityLabel="Post a request"
          className="h-11 w-11 items-center justify-center rounded-full bg-brand-500"><Ionicons name="add" size={26} color="white" /></Pressable>} />
      {q.isLoading ? <RowSkeleton /> : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> :
        !q.data?.length ? (
          <EmptyState emoji="📣" title="No requests yet" body="Can't find what you need? Post a request and sellers will see it."
            action={<Button title="Post a request" icon="megaphone" onPress={() => router.push("/wanted/new")} />} />
        ) : (
          <View className="gap-3">
            {q.data.map((w) => {
              const mine = w.user.id === user?.id;
              return (
                <Pressable key={w.id} onPress={() => router.push(`/wanted/${w.id}`)} accessibilityRole="button">
                  <Card>
                    <View className="flex-row items-start gap-3">
                      <Text style={{ fontSize: 32 }}>{w.category ? emojiFor(w.category) : "🔎"}</Text>
                      <View className="flex-1">
                        <Text className="text-[17px] font-bold text-ink dark:text-white">{w.title}</Text>
                        <Text className="text-[13px] text-ink/60 dark:text-white/60">
                          {mine ? "You" : w.user.name} · under {inr(w.max_price)} · {timeAgo(w.created_at)}
                        </Text>
                        {w.note ? <Text className="mt-1 text-[14px] text-ink/80 dark:text-white/80" numberOfLines={2}>{w.note}</Text> : null}
                      </View>
                    </View>
                    <View className="mt-3 flex-row items-center justify-between">
                      <View className={`rounded-full px-3 py-1 ${w.match_count ? "bg-brand-100 dark:bg-brand-900/60" : "bg-ink/5 dark:bg-white/10"}`}>
                        <Text className={`text-[13px] font-bold ${w.match_count ? "text-brand-700 dark:text-brand-200" : "text-ink/50 dark:text-white/50"}`}>
                          {w.match_count ? `${w.match_count} match${w.match_count === 1 ? "" : "es"} available` : "No matches yet"}
                        </Text>
                      </View>
                      {mine && <Text onPress={() => close.mutate(w.id)} className="text-[13px] font-bold text-red-600">Close request</Text>}
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        )}
    </Screen>
  );
}
