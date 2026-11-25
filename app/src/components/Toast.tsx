import { Ionicons } from "@expo/vector-icons";
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Kind = "info" | "success" | "error";
interface ToastApi { show: (message: string, kind?: Kind) => void }

const ToastContext = createContext<ToastApi>({ show: () => {} });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string; kind: Kind } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const show = useCallback((message: string, kind: Kind = "info") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), message, kind });
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);
  const api = useMemo(() => ({ show }), [show]);

  const icon = toast?.kind === "error" ? "alert-circle" : toast?.kind === "success" ? "checkmark-circle" : "information-circle";
  const tone = toast?.kind === "error" ? "bg-red-600" : toast?.kind === "success" ? "bg-brand-600" : "bg-ink dark:bg-night-line";

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast && (
        <Animated.View key={toast.id} entering={FadeInDown.duration(220)} exiting={FadeOutDown.duration(180)}
          pointerEvents="none" style={{ position: "absolute", left: 16, right: 16, bottom: insets.bottom + 90 }}>
          <View className={`flex-row items-center gap-3 rounded-2xl px-4 py-3 shadow-lg ${tone}`}>
            <Ionicons name={icon} size={22} color="white" />
            <Text className="flex-1 text-[15px] font-medium text-white">{toast.message}</Text>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}
