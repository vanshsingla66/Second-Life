import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import React from "react";
import { View } from "react-native";

import { CardGridSkeleton, EmptyState, ErrorState, Header, ListingCard, Screen } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

export default function WantedMatches() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ["wanted-matches", Number(id)], queryFn: () => api.wantedMatches(Number(id)) });
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Header title="Matches" subtitle="Listings that fit this request" onBack />
      {q.isLoading ? <CardGridSkeleton /> : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> :
        !q.data?.length ? <EmptyState emoji="🌱" title="No matches yet" body="We'll keep looking. Check back when new items get listed." /> : (
          <View className="flex-row flex-wrap gap-3">
            {q.data.map((l, i) => <View key={l.id} style={{ width: "48%" }}><ListingCard listing={l} index={i} /></View>)}
          </View>
        )}
    </Screen>
  );
}
