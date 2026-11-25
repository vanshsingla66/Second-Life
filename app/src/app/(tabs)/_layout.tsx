import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { ColorValue, Pressable, View, useColorScheme } from "react-native";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

function SellButton({ onPress, accessibilityState }: { onPress?: (e: any) => void; accessibilityState?: { selected?: boolean } }) {
  const active = accessibilityState?.selected;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Sell an item"
      style={{ flex: 1, alignItems: "center" }}>
      <View className={`-mt-6 h-16 w-16 items-center justify-center rounded-full border-4 border-cream shadow-lg dark:border-night ${active ? "bg-brand-600" : "bg-brand-500"}`}>
        <Ionicons name="add" size={34} color="white" />
      </View>
    </Pressable>
  );
}

const icon = (name: IconName, focused: IconName) =>
  ({ color, focused: f, size }: { color: ColorValue; focused: boolean; size: number }) =>
    <Ionicons name={f ? focused : name} size={size} color={color as string} />;

export default function TabsLayout() {
  const dark = useColorScheme() === "dark";
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#22a355",
        tabBarInactiveTintColor: dark ? "#ffffff88" : "#14231a88",
        tabBarStyle: {
          backgroundColor: dark ? "#16231A" : "#ffffff",
          borderTopColor: dark ? "#233428" : "#d7f4de",
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Browse", tabBarIcon: icon("storefront-outline", "storefront") }} />
      <Tabs.Screen name="wanted" options={{ title: "Wanted", tabBarIcon: icon("megaphone-outline", "megaphone") }} />
      <Tabs.Screen name="sell" options={{ title: "Sell", tabBarButton: (p) => <SellButton {...p} /> }} />
      <Tabs.Screen name="swaps" options={{ title: "Swaps", tabBarIcon: icon("swap-horizontal-outline", "swap-horizontal") }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: icon("person-outline", "person") }} />
    </Tabs>
  );
}
