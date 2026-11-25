import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { useConfirm } from "@/components/Confirm";
import { WhyThisPrice } from "@/components/PriceCard";
import { useToast } from "@/components/Toast";
import { Button, Card, ErrorState, FairMeter, FairPill, Header, ListingImage, RowSkeleton, Screen, SectionTitle, Skeleton, TrustBadge } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { CONDITION_LABEL, ageLabel, emojiFor, categoryLabel, inr, timeAgo } from "@/lib/format";
import { toggleSaved, useSaved } from "@/lib/saved";
import { assetUrl } from "@/lib/config";
import type { Listing } from "@/lib/types";

export default function ListingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listingId = Number(id);
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const saved = useSaved(listingId);
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ["listing", listingId], queryFn: () => api.listing(listingId), enabled: Number.isFinite(listingId) });

  const refresh = () => { qc.invalidateQueries({ queryKey: ["listings"] }); qc.invalidateQueries({ queryKey: ["my-listings"] }); qc.invalidateQueries({ queryKey: ["listing", listingId] }); qc.invalidateQueries({ queryKey: ["stats"] }); };
  const contact = useMutation({
    mutationFn: () => api.startChat(listingId),
    onSuccess: (c) => router.push(`/chat/${c.id}`),
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const sold = useMutation({ mutationFn: () => api.markSold(listingId), onSuccess: () => { refresh(); toast.show("Marked as sold. Nice one! 🎉", "success"); }, onError: (e) => toast.show(errorMessage(e), "error") });
  const del = useMutation({ mutationFn: () => api.deleteListing(listingId), onSuccess: () => { refresh(); toast.show("Listing deleted", "success"); router.back(); }, onError: (e) => toast.show(errorMessage(e), "error") });

  if (q.isLoading) return <Screen><Header title="" onBack /><Skeleton className="h-60" /><View className="mt-4"><RowSkeleton /></View></Screen>;
  if (q.isError || !q.data) {
    return <Screen><Header title="Listing" onBack /><ErrorState message={q.isError ? errorMessage(q.error) : "We couldn't find this listing."} onRetry={() => q.refetch()} /></Screen>;
  }

  const l = q.data;
  const mine = user?.id === l.seller.id;
  const active = l.status === "active";

  return (
    <Screen edges={["top"]}>
      <Header title="" onBack right={
        <Pressable onPress={() => { const on = toggleSaved(l.id); toast.show(on ? "Saved for later" : "Removed from saved"); }}
          accessibilityLabel={saved ? "Remove from saved" : "Save listing"} className="h-10 w-10 items-center justify-center rounded-full bg-white dark:bg-night-card">
          <Ionicons name={saved ? "heart" : "heart-outline"} size={22} color={saved ? "#e11d48" : "#22a355"} />
        </Pressable>} />
      <Gallery listing={l} />

      <View className="mt-4 flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-[26px] font-extrabold leading-8 text-ink dark:text-white">{l.title}</Text>
          <Text className="mt-1 text-[14px] text-ink/60 dark:text-white/60">
            {emojiFor(l.category)} {categoryLabel(l.category)} · {CONDITION_LABEL[l.condition]} · {ageLabel(l.age_years)} · {timeAgo(l.created_at)}
          </Text>
        </View>
        {!active && <View className="rounded-full bg-ink px-3 py-1 dark:bg-white"><Text className="text-[12px] font-bold uppercase text-white dark:text-ink">{l.status}</Text></View>}
      </View>

      <Card className="mt-4">
        <View className="flex-row items-end justify-between">
          <View>
            <Text className="text-[40px] font-extrabold leading-[44px] text-brand-700 dark:text-brand-300">{inr(l.price)}</Text>
            <Text className="text-[13px] text-ink/50 dark:text-white/50">Originally {inr(l.original_price)} · Fair price {inr(l.suggested_price)}</Text>
          </View>
          <FairPill label={l.fair_label} />
        </View>
        <View className="mt-4"><FairMeter price={l.price} suggested={l.suggested_price} low={l.suggested_low} high={l.suggested_high} /></View>
      </Card>

      {l.description ? <><SectionTitle>About this item</SectionTitle><Text className="text-[15px] leading-[22px] text-ink dark:text-white/90">{l.description}</Text></> : null}

      <SectionTitle>Why this price?</SectionTitle>
      <Card><WhyThisPrice pricing={l.pricing} /></Card>

      <SectionTitle>Seller</SectionTitle>
      <Card className="flex-row items-center gap-3">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900/50">
          <Text className="text-[20px] font-extrabold text-brand-700 dark:text-brand-200">{l.seller.name[0]?.toUpperCase()}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-[16px] font-bold text-ink dark:text-white">{mine ? "You" : l.seller.name}</Text>
          <Text className="text-[12px] text-ink/60 dark:text-white/60">
            {l.seller.trust.items_sold} sold · {l.seller.trust.swaps_done} swaps · {Math.round(l.seller.trust.response_rate * 100)}% reply rate
          </Text>
        </View>
        <TrustBadge trust={l.seller.trust} compact />
      </Card>

      <View className="mt-5 gap-3">
        {mine ? (
          active ? (
            <>
              <Button title="Edit listing" icon="create" onPress={() => router.push(`/edit-listing/${l.id}`)} />
              <Button title="Mark as sold" icon="checkmark-done" variant="secondary" loading={sold.isPending} onPress={() => sold.mutate()} />
              <Button title="Delete listing" icon="trash" variant="danger" loading={del.isPending}
                onPress={async () => { if (await confirm({ title: "Delete this listing?", message: "This can't be undone.", yes: "Delete", emoji: "🗑️" })) del.mutate(); }} />
            </>
          ) : <Text className="text-center text-[14px] text-ink/60 dark:text-white/60">This listing is {l.status}.</Text>
        ) : active ? (
          <>
            <Button title="Contact seller" icon="chatbubble-ellipses" loading={contact.isPending} onPress={() => contact.mutate()} />
            <Button title="Propose a swap" icon="swap-horizontal" variant="secondary" onPress={() => router.push({ pathname: "/swap/propose", params: { requested: String(l.id) } })} />
          </>
        ) : <Text className="text-center text-[14px] text-ink/60 dark:text-white/60">This item is no longer available.</Text>}
      </View>
    </Screen>
  );
}

/** Swipeable photos with dots; falls back to the category illustration when there are none. */
function Gallery({ listing }: { listing: Listing }) {
  const urls = (listing.image_urls?.length ? listing.image_urls : listing.image_url ? [listing.image_url] : [])
    .map((u) => assetUrl(u)).filter((u): u is string => !!u);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  if (urls.length <= 1) return <ListingImage listing={listing} height={260} radius={28} />;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: 260, borderRadius: 28, overflow: "hidden" }}>
      {width > 0 && (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} scrollEventThrottle={32}
          onScroll={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}>
          {urls.map((u, i) => (
            <Image key={u + i} source={{ uri: u }} style={{ width, height: 260 }} contentFit="cover"
              accessibilityLabel={`${listing.title}, photo ${i + 1} of ${urls.length}`} />
          ))}
        </ScrollView>
      )}
      <View className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1">
        <Text className="text-[12px] font-bold text-white">{index + 1}/{urls.length}</Text>
      </View>
      <View className="absolute bottom-3 w-full flex-row justify-center gap-1.5">
        {urls.map((u, i) => (
          <View key={u + i} className={`h-2 rounded-full ${i === index ? "w-5 bg-white" : "w-2 bg-white/50"}`} />
        ))}
      </View>
    </View>
  );
}
