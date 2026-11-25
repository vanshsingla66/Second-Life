import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";

import { Button } from "@/components/ui";

type Ask = { title: string; message?: string; yes?: string; emoji?: string; danger?: boolean };
type ConfirmFn = (ask: Ask) => Promise<boolean>;

const Ctx = createContext<ConfirmFn>(async () => false);

/** In-app confirm dialog. Looks the same on iOS, Android and web (window.confirm looks out of place). */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [ask, setAsk] = useState<Ask | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((a) => new Promise<boolean>((resolve) => {
    resolver.current?.(false);
    resolver.current = resolve;
    setAsk(a);
  }), []);

  const close = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setAsk(null);
  };

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Modal transparent animationType="fade" visible={!!ask} onRequestClose={() => close(false)}>
        <Pressable className="flex-1 items-center justify-center bg-black/50 px-6" onPress={() => close(false)}>
          <Pressable className="w-full max-w-[380px] rounded-3xl bg-white p-6 dark:bg-night-card" onPress={() => {}}>
            {ask?.emoji ? <Text className="text-center text-[40px]">{ask.emoji}</Text> : null}
            <Text className="mt-2 text-center text-[18px] font-extrabold text-ink dark:text-white">{ask?.title}</Text>
            {ask?.message ? (
              <Text className="mt-1 text-center text-[14px] text-ink/60 dark:text-white/60">{ask.message}</Text>
            ) : null}
            <View className="mt-5 flex-row gap-2">
              <View className="flex-1"><Button title="Cancel" variant="secondary" onPress={() => close(false)} /></View>
              <View className="flex-1">
                <Button title={ask?.yes ?? "OK"} variant={ask?.danger === false ? "primary" : "danger"} onPress={() => close(true)} />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Ctx.Provider>
  );
}

export const useConfirm = () => useContext(Ctx);
