import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { EmptyState, ErrorState, Header, ListingImage, RowSkeleton, Screen } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { inr, timeAgo } from "@/lib/format";

export default function Messages() {
  const q = useQuery({ queryKey: ["inbox"], queryFn: api.inbox, refetchInterval: 10_000 });
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Header title="Messages" subtitle="Chats with buyers and sellers" onBack />
      {q.isLoading ? <RowSkeleton /> : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> :
        !q.data?.length ? (
          <EmptyState emoji="💬" title="No messages yet" body="Tap “Contact seller” on any item to start a chat. Buyers who message you about your listings show up here too." />
        ) : (
          <View className="gap-2.5">
            {q.data.map((c) => (
              <Pressable key={c.id} onPress={() => router.push(`/chat/${c.id}`)} accessibilityRole="button"
                accessibilityLabel={`Chat with ${c.other.name} about ${c.listing.title}${c.unread ? `, ${c.unread} unread` : ""}`}
                className="flex-row items-center gap-3 rounded-3xl bg-white p-3 active:opacity-80 dark:bg-night-card">
                <View style={{ width: 56 }}><ListingImage listing={c.listing} height={56} radius={14} /></View>
                <View className="flex-1">
                  <View className="flex-row items-center justify-between">
                    <Text numberOfLines={1} className="flex-1 text-[15px] font-extrabold text-ink dark:text-white">{c.other.name}</Text>
                    <Text className="ml-2 text-[11px] text-ink/40 dark:text-white/40">{timeAgo(c.updated_at)}</Text>
                  </View>
                  <Text numberOfLines={1} className="text-[12px] text-ink/50 dark:text-white/50">
                    {c.i_am_seller ? "Buying your " : "Selling "}{c.listing.title} · {inr(c.listing.price)}
                  </Text>
                  <Text numberOfLines={1} className={`text-[14px] ${c.unread ? "font-bold text-ink dark:text-white" : "text-ink/70 dark:text-white/70"}`}>
                    {c.last_message}
                  </Text>
                </View>
                {c.unread > 0 ? (
                  <View className="h-6 min-w-6 items-center justify-center rounded-full bg-brand-500 px-1.5">
                    <Text className="text-[12px] font-extrabold text-white">{c.unread}</Text>
                  </View>
                ) : <Ionicons name="chevron-forward" size={18} color="#999" />}
              </Pressable>
            ))}
          </View>
        )}
    </Screen>
  );
}
