import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { Platform } from "react-native";

import { API_URL } from "./config";
import * as storage from "./storage";
import type {
  AiStatus, ChatMessage, ChatReply, Conversation, Identified, Thread, Insights, Listing, ListingDetail, ListingFilters, ListingInput, ListingPage, ListingUpdate, Meta, PriceRequest,
  PriceSuggestion, Stats, Swap, SwapQuote, TokenResponse, Trust, User, Wanted, WantedInput,
} from "./types";

const ACCESS_KEY = "green.access";
const REFRESH_KEY = "green.refresh";

let accessToken: string | null = null;
let refreshToken: string | null = null;
let onSessionLost: (() => void) | null = null;

export const setSessionLostHandler = (fn: (() => void) | null) => { onSessionLost = fn; };

export async function loadTokens(): Promise<boolean> {
  [accessToken, refreshToken] = await Promise.all([storage.getItem(ACCESS_KEY), storage.getItem(REFRESH_KEY)]);
  return !!refreshToken;
}

export async function saveTokens(t: { access_token: string; refresh_token: string }) {
  accessToken = t.access_token;
  refreshToken = t.refresh_token;
  await Promise.all([storage.setItem(ACCESS_KEY, t.access_token), storage.setItem(REFRESH_KEY, t.refresh_token)]);
}

export async function clearTokens() {
  accessToken = refreshToken = null;
  await Promise.all([storage.removeItem(ACCESS_KEY), storage.removeItem(REFRESH_KEY)]);
}

export const getRefreshToken = () => refreshToken;

export const http = axios.create({ baseURL: API_URL, timeout: 15000 });

http.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// One refresh at a time: concurrent 401s wait for the same promise.
let refreshing: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (!refreshToken) throw new Error("no refresh token");
  // plain axios (no interceptors) so a failing refresh can't loop
  const { data } = await axios.post<TokenResponse>(`${API_URL}/auth/refresh`, { refresh_token: refreshToken }, { timeout: 15000 });
  await saveTokens(data);
  return data.access_token;
}

http.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const isAuthCall = original?.url?.startsWith("/auth/");
    if (error.response?.status === 401 && original && !original._retried && !isAuthCall && refreshToken) {
      original._retried = true;
      try {
        refreshing = refreshing ?? refreshAccessToken().finally(() => { refreshing = null; });
        const token = await refreshing;
        original.headers.Authorization = `Bearer ${token}`;
        return http(original);
      } catch (e) {
        // Sign out only when the server says the refresh token is no good; a network blip keeps the session.
        const status = (e as AxiosError)?.response?.status;
        if (status === 401 || status === 403) {
          await clearTokens();
          onSessionLost?.();
        }
      }
    }
    return Promise.reject(error);
  },
);

/** Turn any thrown error into a message a person can read. */
export function errorMessage(e: unknown): string {
  const err = e as AxiosError<{ detail?: unknown }>;
  if (err?.isAxiosError) {
    if (!err.response) return "Can't reach the server. Check your connection and that the backend is running.";
    const d = err.response.data?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
      return d.map((x: any) => `${(x.loc ?? []).slice(1).join(".") || "input"}: ${String(x.msg).replace(/^Value error, /, "")}`).join("\n");
    }
    return `Something went wrong (${err.response.status}).`;
  }
  return e instanceof Error ? e.message : "Something went wrong.";
}

const get = async <T,>(url: string, params?: object) => (await http.get<T>(url, { params })).data;
const post = async <T,>(url: string, body?: object) => (await http.post<T>(url, body)).data;

export const api = {
  // auth
  register: (b: { name: string; email: string; password: string }) => post<TokenResponse>("/auth/register", b),
  login: (b: { email: string; password: string }) => post<TokenResponse>("/auth/login", b),
  google: (id_token: string) => post<TokenResponse>("/auth/google", { id_token }),
  logout: (refresh_token: string) => post<void>("/auth/logout", { refresh_token }),
  me: () => get<User>("/me"),
  stats: () => get<Stats>("/me/stats"),
  trust: (sellerId: number) => get<Trust>(`/sellers/${sellerId}/trust`),

  // data
  meta: () => get<Meta>("/meta"),
  suggest: (b: PriceRequest) => post<PriceSuggestion>("/price/suggest", b),
  insights: () => get<Insights>("/insights"),

  // listings
  listings: (f: ListingFilters & { page?: number; page_size?: number }) =>
    get<ListingPage>("/listings", { ...f, condition: f.condition?.length ? f.condition.join(",") : undefined }),
  listing: (id: number) => get<ListingDetail>(`/listings/${id}`),
  myListings: () => get<Listing[]>("/listings/mine"),
  createListing: (b: ListingInput) => post<Listing>("/listings", b),
  updateListing: async (id: number, b: ListingUpdate) => (await http.put<Listing>(`/listings/${id}`, b)).data,
  deleteListing: async (id: number) => { await http.delete(`/listings/${id}`); },
  markSold: (id: number) => post<Listing>(`/listings/${id}/sold`),

  // wanted
  wanted: () => get<Wanted[]>("/wanted"),
  createWanted: (b: WantedInput) => post<Wanted>("/wanted", b),
  wantedMatches: (id: number) => get<Listing[]>(`/wanted/${id}/matches`),
  closeWanted: async (id: number) => { await http.delete(`/wanted/${id}`); },

  // swaps
  swaps: () => get<Swap[]>("/swaps"),
  swapQuote: (offered: number, requested: number) =>
    get<SwapQuote>("/swaps/quote", { offered_listing_id: offered, requested_listing_id: requested }),
  proposeSwap: (offered: number, requested: number) =>
    post<Swap>("/swaps", { offered_listing_id: offered, requested_listing_id: requested }),
  acceptSwap: (id: number) => post<Swap>(`/swaps/${id}/accept`),
  declineSwap: (id: number) => post<Swap>(`/swaps/${id}/decline`),

  // AI (Gemini, called through our backend; the key never ships in the app)
  aiStatus: () => get<AiStatus>("/ai/status"),
  identify: (image_urls: string[]) => (http.post<Identified>("/ai/identify", { image_urls }, { timeout: 60000 })).then((r) => r.data),
  chat: (messages: ChatMessage[]) => (http.post<ChatReply>("/ai/chat", { messages }, { timeout: 60000 })).then((r) => r.data),

  // buyer <-> seller messages
  startChat: (listing_id: number) => post<Conversation>("/chats", { listing_id }),
  inbox: () => get<Conversation[]>("/chats"),
  unread: () => get<{ unread: number }>("/chats/unread"),
  thread: (id: number) => get<Thread>(`/chats/${id}`),
  sendMessage: (id: number, body: string, offer_price?: number) => post<Thread>(`/chats/${id}/messages`, { body, offer_price }),
  decideOffer: (id: number, messageId: number, accept: boolean) => post<Thread>(`/chats/${id}/offers/${messageId}`, { accept }),

  // uploads
  async uploadImage(uri: string, mime = "image/jpeg"): Promise<string> {
    const form = new FormData();
    if (Platform.OS === "web") {
      form.append("file", await (await fetch(uri)).blob(), "photo.jpg");
    } else {
      form.append("file", { uri, name: "photo.jpg", type: mime } as unknown as Blob);
    }
    const { data } = await http.post<{ url: string }>("/uploads", form, {
      headers: { "Content-Type": "multipart/form-data" },
      transformRequest: (d) => d,
    });
    return data.url;
  },
};
