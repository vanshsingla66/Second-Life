import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Where the FastAPI backend lives.
 * 1. EXPO_PUBLIC_API_URL if set (deployed backend / ngrok).
 * 2. Otherwise the same machine that serves the Expo bundle (your laptop's LAN IP), port 8787.
 *    This is what lets a real phone in Expo Go reach the API without editing any file.
 */
function resolveApiUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const hostUri = Constants.expoConfig?.hostUri ?? (Constants as any).expoGoConfig?.debuggerHost;
  const host = hostUri?.split(":")[0];
  if (host) return `http://${host}:8787`;
  return Platform.OS === "android" ? "http://10.0.2.2:8787" : "http://localhost:8787";
}

export const API_URL = resolveApiUrl();

export const GOOGLE = {
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || undefined,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined,
};

/** The Google provider throws if the current platform's client id is missing, so check per platform. */
export const googleConfigured =
  Platform.OS === "android" ? !!GOOGLE.androidClientId :
  Platform.OS === "ios" ? !!GOOGLE.iosClientId : !!GOOGLE.webClientId;

export function assetUrl(path?: string | null): string | null {
  if (!path) return null;
  return /^https?:|^file:|^data:/.test(path) ? path : `${API_URL}${path}`;
}
