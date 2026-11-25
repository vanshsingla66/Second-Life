import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// Tokens live ONLY in expo-secure-store on iOS/Android (Keychain / Keystore).
// SecureStore doesn't exist on web, so the browser preview falls back to localStorage (dev convenience only).
const web = Platform.OS === "web";

export async function getItem(key: string): Promise<string | null> {
  try {
    return web ? globalThis.localStorage?.getItem(key) ?? null : await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  try {
    if (web) globalThis.localStorage?.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    /* storage unavailable: the session just won't persist */
  }
}

export async function removeItem(key: string): Promise<void> {
  try {
    if (web) globalThis.localStorage?.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
  } catch {
    /* ignore */
  }
}
