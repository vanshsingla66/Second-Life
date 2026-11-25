import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { EmptyState, Header, ListingImage, Screen } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { inr } from "@/lib/format";
import { useAiStatus } from "@/lib/queries";
import type { ChatMessage } from "@/lib/types";

interface Msg extends ChatMessage { listingIds?: number[]; error?: boolean }

const SUGGESTIONS = [
  "Find me a calculator under ₹600",
  "What should I ask for my 2-year-old cycle?",
  "How do swaps work here?",
  "When is the best time to sell textbooks?",
];

export default function Assistant() {
  const { user } = useAuth();
  const status = useAiStatus();
  const first = user?.name?.split(" ")[0] ?? "there";
  const [msgs, setMsgs] = useState<Msg[]>([{
    role: "assistant",
    content: `Hi ${first}! 👋 I'm GREEN Assistant. Ask me to find items, check if a price is fair, or explain swaps and trust badges.`,
  }]);
  const [text, setText] = useState("");
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);

  const send = useMutation({
    mutationFn: (history: ChatMessage[]) => api.chat(history),
    onSuccess: (r) => setMsgs((m) => [...m, { role: "assistant", content: r.reply, listingIds: r.listing_ids }]),
    onError: (e) => setMsgs((m) => [...m, { role: "assistant", content: errorMessage(e), error: true }]),
  });

  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60); }, [msgs.length, send.isPending]);

  function submit(raw: string) {
    const content = raw.trim();
    if (!content || send.isPending) return;
    const next = [...msgs, { role: "user" as const, content }];
    setMsgs(next);
    setText("");
    // the greeting and error bubbles are UI only; send the real conversation
    send.mutate(next.slice(1).filter((m) => !m.error).map(({ role, content: c }) => ({ role, content: c })));
  }

  if (status.data && !status.data.enabled) {
    return (
      <Screen>
        <Header title="GREEN Assistant" onBack />
        <EmptyState emoji="🤖" title="Assistant is switched off"
          body="Add GEMINI_API_KEY to backend/.env and restart the server to turn on the assistant and photo recognition." />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} edges={["top", "bottom"]}>
      <Header title="GREEN Assistant" subtitle="Powered by Gemini" onBack
        right={<View className="h-10 w-10 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-950"><Text style={{ fontSize: 20 }}>🤖</Text></View>} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={8}>
        <ScrollView ref={scroll} className="flex-1" contentContainerStyle={{ paddingBottom: 12, gap: 10 }} keyboardShouldPersistTaps="handled">
          {msgs.map((m, i) => <Bubble key={i} msg={m} />)}
          {send.isPending && (
            <View className="self-start flex-row items-center gap-2 rounded-3xl rounded-bl-md bg-white px-4 py-3 dark:bg-night-card">
              <ActivityIndicator size="small" color="#7c3aed" />
              <Text className="text-[14px] text-ink/60 dark:text-white/60">Thinking…</Text>
            </View>
          )}
          {msgs.length === 1 && (
            <View className="mt-2 gap-2">
              <Text className="text-[12px] font-bold uppercase tracking-wider text-ink/50 dark:text-white/50">Try asking</Text>
              {SUGGESTIONS.map((s) => (
                <Pressable key={s} onPress={() => submit(s)} accessibilityRole="button"
                  className="self-start rounded-2xl border border-violet-200 bg-violet-50 px-3.5 py-2.5 active:opacity-70 dark:border-violet-900 dark:bg-violet-950/40">
                  <Text className="text-[14px] font-semibold text-violet-800 dark:text-violet-200">{s}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
        <View className="mb-2 flex-row items-end gap-2 rounded-3xl border border-ink/10 bg-white p-1.5 pl-4 dark:border-white/10 dark:bg-night-card">
          <TextInput value={text} onChangeText={setText} placeholder="Ask about items, prices, swaps…" placeholderTextColor="#999"
            multiline maxLength={2000} accessibilityLabel="Message"
            onSubmitEditing={() => submit(text)} blurOnSubmit={false} returnKeyType="send"
            onKeyPress={(e: any) => { if (Platform.OS === "web" && e.nativeEvent.key === "Enter" && !e.nativeEvent.shiftKey) { e.preventDefault?.(); submit(text); } }}
            className="max-h-28 flex-1 py-2.5 text-[15px] text-ink dark:text-white" style={{ outlineStyle: "none" } as any} />
          <Pressable onPress={() => submit(text)} disabled={!text.trim() || send.isPending} accessibilityRole="button" accessibilityLabel="Send"
            className={`h-11 w-11 items-center justify-center rounded-full ${text.trim() && !send.isPending ? "bg-brand-500" : "bg-ink/15 dark:bg-white/15"}`}>
            <Ionicons name="arrow-up" size={22} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  const mine = msg.role === "user";
  // [#12] citations become tappable; the cards below show the listings themselves
  const parts = msg.content.split(/(\[#\d+\])/g);
  return (
    <View className={`max-w-[88%] ${mine ? "self-end" : "self-start"}`}>
      <View className={`rounded-3xl px-4 py-3 ${mine ? "rounded-br-md bg-brand-500" : msg.error
        ? "rounded-bl-md border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40" : "rounded-bl-md bg-white dark:bg-night-card"}`}>
        <Text className={`text-[15px] leading-[21px] ${mine ? "text-white" : msg.error ? "text-red-700 dark:text-red-300" : "text-ink dark:text-white"}`}>
          {parts.map((p, i) => {
            const id = /^\[#(\d+)\]$/.exec(p)?.[1];
            return id && msg.listingIds?.includes(Number(id))
              ? <Text key={i} onPress={() => router.push(`/listing/${id}`)} className="font-bold text-brand-600 underline dark:text-brand-300"> ↗</Text>
              : id ? null : <Text key={i}>{p}</Text>;
          })}
        </Text>
      </View>
      {!!msg.listingIds?.length && (
        <View className="mt-2 gap-2">
          {msg.listingIds.slice(0, 4).map((id) => <ListingRef key={id} id={id} />)}
        </View>
      )}
    </View>
  );
}

function ListingRef({ id }: { id: number }) {
  const q = useQuery({ queryKey: ["listing", id], queryFn: () => api.listing(id) });
  const l = q.data;
  if (!l) return null;
  return (
    <Pressable onPress={() => router.push(`/listing/${id}`)} accessibilityRole="button" accessibilityLabel={`Open ${l.title}`}
      className="flex-row items-center gap-3 rounded-2xl border border-brand-200 bg-white p-2 active:opacity-80 dark:border-night-line dark:bg-night-card">
      <View style={{ width: 52 }}><ListingImage listing={l} height={52} radius={12} /></View>
      <View className="flex-1">
        <Text numberOfLines={1} className="text-[14px] font-bold text-ink dark:text-white">{l.title}</Text>
        <Text className="text-[14px] font-extrabold text-brand-700 dark:text-brand-300">{inr(l.price)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#22a355" />
    </Pressable>
  );
}
