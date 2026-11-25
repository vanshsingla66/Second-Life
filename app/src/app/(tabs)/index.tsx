import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/auth/AuthContext";
import { Button, CardGridSkeleton, Chip, EmptyState, ErrorState, Field, ListingCard, useIsDark } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { CONDITION_LABEL, emojiFor, parseNumber } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import { useMeta, useUnread } from "@/lib/queries";
import type { Condition, ListingFilters } from "@/lib/types";

const SORTS: { id: NonNullable<ListingFilters["sort"]>; label: string }[] = [
  { id: "newest", label: "Newest" }, { id: "best_deal", label: "Best deals" },
  { id: "price_asc", label: "Price: low to high" }, { id: "price_desc", label: "Price: high to low" },
];

export default function Browse() {
  const { user } = useAuth();
  const dark = useIsDark();
  const meta = useMeta();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | undefined>();
  const [condition, setCondition] = useState<Condition[]>([]);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState<NonNullable<ListingFilters["sort"]>>("newest");
  const [sheet, setSheet] = useState(false);
  const q = useDebounced(search.trim());

  const filters: ListingFilters = useMemo(() => ({
    q: q || undefined, category, condition, sort,
    min_price: parseNumber(minPrice) ?? undefined, max_price: parseNumber(maxPrice) ?? undefined,
  }), [q, category, condition, sort, minPrice, maxPrice]);

  const query = useInfiniteQuery({
    queryKey: ["listings", filters],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.listings({ ...filters, page: pageParam, page_size: 12 }),
    getNextPageParam: (last) => (last.page * last.page_size < last.total ? last.page + 1 : undefined),
  });

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;
  const activeFilters = (condition.length ? 1 : 0) + (minPrice ? 1 : 0) + (maxPrice ? 1 : 0) + (sort !== "newest" ? 1 : 0);

  const unread = useUnread().data?.unread ?? 0;
  const header = (
    <View className="pb-2">
      <View className="flex-row items-center justify-between pt-2">
        <View>
          <Text className="text-[14px] text-ink/60 dark:text-white/60">Hi {user?.name.split(" ")[0]} 👋</Text>
          <Text className="text-[28px] font-extrabold text-ink dark:text-white">Campus market</Text>
        </View>
        <View className="flex-row gap-2">
          <Pressable onPress={() => router.push("/assistant")} accessibilityRole="button" accessibilityLabel="Ask GREEN Assistant"
            className="h-11 flex-row items-center gap-1.5 rounded-full bg-violet-100 px-3.5 dark:bg-violet-950">
            <Ionicons name="sparkles" size={16} color="#7c3aed" />
            <Text className="text-[13px] font-extrabold text-violet-700 dark:text-violet-300">Ask AI</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/messages")} accessibilityRole="button"
            accessibilityLabel={unread ? `Messages, ${unread} unread` : "Messages"}
            className="h-11 w-11 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900/50">
            <Ionicons name="chatbubbles" size={20} color="#22a355" />
            {unread > 0 && (
              <View className="absolute -right-1 -top-1 h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1">
                <Text className="text-[11px] font-extrabold text-white">{unread > 9 ? "9+" : unread}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      <View className="mt-4 overflow-hidden rounded-3xl bg-brand-600 p-4 dark:bg-brand-700">
        <Text style={{ position: "absolute", right: -8, top: -14, fontSize: 96, opacity: 0.18 }}>♻️</Text>
        <Text className="text-[12px] font-bold uppercase tracking-widest text-white/70">Second Life</Text>
        <Text className="mt-1 text-[20px] font-extrabold leading-6 text-white">Pre-loved campus gear,{"\n"}fairly priced.</Text>
        <Text className="mt-1 text-[13px] text-white/80">Every price is explained by real past sales.</Text>
        <View className="mt-3 flex-row gap-2">
          <Pressable onPress={() => router.push("/sell")} accessibilityRole="button"
            className="flex-row items-center gap-1.5 rounded-full bg-white px-4 py-2 active:opacity-80">
            <Ionicons name="flash" size={14} color="#158343" />
            <Text className="text-[13px] font-bold text-brand-700">Sell in 60 seconds</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/insights")} accessibilityRole="button"
            className="flex-row items-center gap-1.5 rounded-full bg-white/20 px-4 py-2 active:opacity-80">
            <Ionicons name="stats-chart" size={14} color="white" />
            <Text className="text-[13px] font-bold text-white">Price trends</Text>
          </Pressable>
        </View>
      </View>

      <View className="mt-4 flex-row items-center gap-2">
        <View className="flex-1 flex-row items-center gap-2 rounded-2xl border border-brand-100 bg-white px-3 dark:border-night-line dark:bg-night-card">
          <Ionicons name="search" size={18} color="#22a355" />
          <TextInput value={search} onChangeText={setSearch} placeholder="Search calculators, cycles, books…"
            placeholderTextColor={dark ? "#ffffff55" : "#14231a55"} returnKeyType="search" accessibilityLabel="Search listings"
            className="flex-1 py-3.5 text-[16px] text-ink dark:text-white" />
          {search ? <Pressable onPress={() => setSearch("")} hitSlop={8}><Ionicons name="close-circle" size={18} color="#999" /></Pressable> : null}
        </View>
        <Pressable onPress={() => setSheet(true)} accessibilityLabel="Filters"
          className="h-[50px] w-[50px] items-center justify-center rounded-2xl bg-brand-500">
          <Ionicons name="options" size={22} color="white" />
          {activeFilters > 0 && (
            <View className="absolute -right-1 -top-1 h-5 w-5 items-center justify-center rounded-full bg-sun-500">
              <Text className="text-[11px] font-extrabold text-ink">{activeFilters}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3" contentContainerStyle={{ paddingRight: 8 }}>
        <Chip label="All" selected={!category} onPress={() => setCategory(undefined)} />
        {meta.data?.categories.map((c) => (
          <Chip key={c.id} label={c.label} emoji={emojiFor(c.id)} selected={category === c.id}
            onPress={() => setCategory(category === c.id ? undefined : c.id)} />
        ))}
      </ScrollView>
      {!query.isLoading && !query.isError && (
        <Text className="mb-1 mt-3 text-[13px] text-ink/50 dark:text-white/50">{total} item{total === 1 ? "" : "s"} waiting for a second life</Text>
      )}
    </View>
  );

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-cream dark:bg-night">
      <FlatList
        data={items.length % 2 === 1 ? [...items, null] : items}
        keyExtractor={(l, i) => (l ? String(l.id) : `spacer-${i}`)}
        numColumns={2}
        columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120, gap: 12 }}
        ListHeaderComponent={header}
        renderItem={({ item, index }) => (item ? <ListingCard listing={item} index={index} /> : <View style={{ flex: 1 }} />)}
        onEndReached={() => { if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage(); }}
        onEndReachedThreshold={0.4}
        refreshing={query.isRefetching && !query.isFetchingNextPage}
        onRefresh={() => query.refetch()}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          query.isLoading ? <CardGridSkeleton /> :
          query.isError ? <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} /> :
          <EmptyState emoji="🔍" title="Nothing here yet"
            body="No listings match those filters. Try widening your search, or post what you're looking for."
            action={<Button title="Post a wanted request" icon="megaphone" onPress={() => router.push("/wanted/new")} />} />
        }
        ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator className="py-4" color="#22a355" /> : undefined}
      />
      <FilterSheet visible={sheet} onClose={() => setSheet(false)} condition={condition} setCondition={setCondition}
        minPrice={minPrice} maxPrice={maxPrice} setMinPrice={setMinPrice} setMaxPrice={setMaxPrice} sort={sort} setSort={setSort} />
    </SafeAreaView>
  );
}

function FilterSheet({
  visible, onClose, condition, setCondition, minPrice, maxPrice, setMinPrice, setMaxPrice, sort, setSort,
}: {
  visible: boolean; onClose: () => void; condition: Condition[]; setCondition: (c: Condition[]) => void;
  minPrice: string; maxPrice: string; setMinPrice: (s: string) => void; setMaxPrice: (s: string) => void;
  sort: NonNullable<ListingFilters["sort"]>; setSort: (s: NonNullable<ListingFilters["sort"]>) => void;
}) {
  const meta = useMeta();
  const min = parseNumber(minPrice), max = parseNumber(maxPrice);
  const badRange = min !== null && max !== null && min > max;
  const toggle = (c: Condition) => setCondition(condition.includes(c) ? condition.filter((x) => x !== c) : [...condition, c]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40" onPress={onClose} accessibilityLabel="Close filters" />
      <View className="rounded-t-[32px] bg-cream px-5 pb-8 pt-4 dark:bg-night">
        <View className="mb-3 h-1.5 w-12 self-center rounded-full bg-brand-200 dark:bg-night-line" />
        <Text className="mb-3 text-[22px] font-extrabold text-ink dark:text-white">Filters</Text>
        <Text className="mb-2 text-[13px] font-bold text-ink/70 dark:text-white/70">Condition</Text>
        <View className="mb-4 flex-row flex-wrap gap-y-2">
          {meta.data?.conditions.map((c) => <Chip key={c.id} label={CONDITION_LABEL[c.id]} selected={condition.includes(c.id)} onPress={() => toggle(c.id)} />)}
        </View>
        <Text className="mb-2 text-[13px] font-bold text-ink/70 dark:text-white/70">Price range (₹)</Text>
        <View className="flex-row gap-3">
          <View className="flex-1"><Field label="Min" value={minPrice} onChangeText={setMinPrice} keyboardType="number-pad" placeholder="0" /></View>
          <View className="flex-1"><Field label="Max" value={maxPrice} onChangeText={setMaxPrice} keyboardType="number-pad" placeholder="Any"
            error={badRange ? "Max must be above min" : null} /></View>
        </View>
        <Text className="mb-2 text-[13px] font-bold text-ink/70 dark:text-white/70">Sort by</Text>
        <View className="mb-5 flex-row flex-wrap gap-y-2">
          {SORTS.map((s) => <Chip key={s.id} label={s.label} selected={sort === s.id} onPress={() => setSort(s.id)} />)}
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1"><Button title="Reset" variant="secondary" onPress={() => { setCondition([]); setMinPrice(""); setMaxPrice(""); setSort("newest"); }} /></View>
          <View className="flex-1"><Button title="Show results" disabled={badRange} onPress={onClose} /></View>
        </View>
      </View>
    </Modal>
  );
}
