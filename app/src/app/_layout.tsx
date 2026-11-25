import "../global.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { colorScheme } from "nativewind";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "@/auth/AuthContext";
import { ConfirmProvider } from "@/components/Confirm";
import { ToastProvider } from "@/components/Toast";

SplashScreen.preventAutoHideAsync().catch(() => {});
/**
 * `dark:` classes follow the device theme. NativeWind tracks the system on native. On web it only learns its dark
 * class name after the CSS has loaded, so we toggle the `dark` class on <html> ourselves from prefers-color-scheme.
 */
function useSyncColorScheme() {
  useEffect(() => {
    if (Platform.OS !== "web") {
      try { colorScheme.set("system"); } catch { /* keep default */ }
      return;
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.classList.toggle("dark", mq.matches);
      try { colorScheme.set(mq.matches ? "dark" : "light"); } catch { /* flag not ready yet; the class above is enough */ }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 20_000, refetchOnWindowFocus: false } },
});

function RootNav() {
  const { user, loading } = useAuth();
  useEffect(() => { if (!loading) SplashScreen.hideAsync().catch(() => {}); }, [loading]);
  if (loading) return null; // splash screen stays up while we restore the session

  const signedIn = !!user;
  return (
    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="listing/[id]" />
        <Stack.Screen name="edit-listing/[id]" />
        <Stack.Screen name="my-listings" />
        <Stack.Screen name="insights" />
        <Stack.Screen name="assistant" />
        <Stack.Screen name="messages" />
        <Stack.Screen name="chat/[id]" />
        <Stack.Screen name="swap/propose" options={{ presentation: "modal" }} />
        <Stack.Screen name="wanted/new" options={{ presentation: "modal" }} />
        <Stack.Screen name="wanted/[id]" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  useSyncColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <ConfirmProvider>
              <AuthProvider>
                <StatusBar style="auto" />
                <RootNav />
              </AuthProvider>
            </ConfirmProvider>
          </ToastProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
