import { router } from "expo-router";
import React, { useRef, useState } from "react";
import { Text, View, useWindowDimensions, ScrollView, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui";

const SLIDES = [
  { emoji: "🌱", title: "Give old stuff a second life", body: "Seniors' books, calculators and cycles find a new home with juniors, instead of the bin." },
  { emoji: "🏷️", title: "Know what's fair", body: "Our price guide learns from past campus sales and tells you exactly why a price makes sense." },
  { emoji: "🔄", title: "Sell, swap or ask", body: "List in under a minute, swap items with a fair cash top-up, or post what you're looking for." },
];

export default function Onboarding() {
  const { width } = useWindowDimensions();
  const ref = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [page, setPage] = useState(0);
  const last = page === SLIDES.length - 1;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setPage(Math.round(e.nativeEvent.contentOffset.x / width));

  return (
    <SafeAreaView className="flex-1 bg-brand-600">
      <View className="items-end px-5 pt-2">
        <Text onPress={() => router.push("/login")} className="p-2 text-[15px] font-semibold text-white/80">Skip</Text>
      </View>
      <ScrollView ref={ref} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16}>
        {SLIDES.map((s) => (
          <View key={s.title} style={{ width }} className="items-center justify-center px-9">
            <View className="mb-8 h-44 w-44 items-center justify-center rounded-full bg-white/15">
              <Text style={{ fontSize: 84 }}>{s.emoji}</Text>
            </View>
            <Text className="text-center text-[30px] font-extrabold leading-9 text-white">{s.title}</Text>
            <Text className="mt-3 text-center text-[16px] leading-6 text-white/85">{s.body}</Text>
          </View>
        ))}
      </ScrollView>
      <View className="items-center px-6 pb-6">
        <View className="mb-5 flex-row gap-2">
          {SLIDES.map((s, i) => <View key={s.title} className={`h-2 rounded-full ${i === page ? "w-6 bg-white" : "w-2 bg-white/40"}`} />)}
        </View>
        <View className="w-full gap-2">
          <Button title={last ? "Get started" : "Next"} variant="secondary"
            onPress={() => (last ? router.push("/register") : ref.current?.scrollTo({ x: width * (page + 1), animated: true }))} />
          <Text onPress={() => router.push("/login")} accessibilityRole="button"
            className="py-3 text-center text-[15px] font-semibold text-white">I already have an account</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
