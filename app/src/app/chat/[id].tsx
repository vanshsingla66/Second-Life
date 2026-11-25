import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { useToast } from "@/components/Toast";
import { Button, ErrorState, FairPill, Header, ListingImage, RowSkeleton, Screen } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { inr, parseNumber, timeAgo } from "@/lib/format";
import type { Thread, ThreadMessage } from "@/lib/types";

const HINT = {
  steal: "Well below the fair price. The seller may say no, but it doesn't hurt to ask.",
  fair: "Close to the fair price from past campus sales. Good chance it gets accepted.",
  pricey: "Above the fair price. You could offer less.",
} as const;

const QUICK = ["Hi! Is this still available?", "Can I see it today?", "Where can we meet on campus?"];

export default function ChatThread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const convId = Number(id);
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState("");
  const [offerOpen, setOfferOpen] = useState(false);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);

  // poll while the chat is open so both people see new messages within a few seconds
  const q = useQuery({ queryKey: ["thread", convId], queryFn: () => api.thread(convId), refetchInterval: 4000,
    enabled: Number.isFinite(convId) });
  const put = (t: Thread) => { qc.setQueryData(["thread", convId], t); qc.invalidateQueries({ queryKey: ["inbox"] }); };
  const send = useMutation({
    mutationFn: (v: { body: string; offer?: number }) => api.sendMessage(convId, v.body, v.offer),
    onSuccess: (t) => { put(t); setText(""); },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const decide = useMutation({
    mutationFn: (v: { messageId: number; accept: boolean }) => api.decideOffer(convId, v.messageId, v.accept),
    onSuccess: (t, v) => { put(t); toast.show(v.accept ? "Offer accepted 🤝" : "Offer declined", v.accept ? "success" : "info"); },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  const count = q.data?.messages.length ?? 0;
  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 80); }, [count]);
  useEffect(() => { if (q.data) qc.invalidateQueries({ queryKey: ["unread"] }); }, [q.data?.conversation.unread, qc]); // eslint-disable-line

  if (q.isLoading) return <Screen><Header title="Chat" onBack /><RowSkeleton /></Screen>;
  if (q.isError || !q.data) return <Screen><Header title="Chat" onBack /><ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /></Screen>;

  const { conversation: c, messages } = q.data;
  const active = c.listing.status === "active";
  const submit = (body: string) => { if (body.trim() && !send.isPending) send.mutate({ body: body.trim() }); };

  return (
    <Screen scroll={false} edges={["top", "bottom"]}>
      <Header title={c.other.name} subtitle={c.i_am_seller ? "Wants to buy your item" : "Seller"} onBack />

      <Pressable onPress={() => router.push(`/listing/${c.listing.id}`)} accessibilityRole="button" accessibilityLabel={`Open ${c.listing.title}`}
        className="mb-2 flex-row items-center gap-3 rounded-2xl border border-brand-200 bg-white p-2 dark:border-night-line dark:bg-night-card">
        <View style={{ width: 48 }}><ListingImage listing={c.listing} height={48} radius={12} /></View>
        <View className="flex-1">
          <Text numberOfLines={1} className="text-[14px] font-bold text-ink dark:text-white">{c.listing.title}</Text>
          <Text className="text-[13px] text-ink/60 dark:text-white/60">
            <Text className="font-extrabold text-brand-700 dark:text-brand-300">{inr(c.listing.price)}</Text> · fair price {inr(c.listing.suggested_price)}
            {!active ? ` · ${c.listing.status}` : ""}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#22a355" />
      </Pressable>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={8}>
        <ScrollView ref={scroll} className="flex-1" contentContainerStyle={{ gap: 8, paddingVertical: 8 }} keyboardShouldPersistTaps="handled">
          <View className="mb-1 flex-row items-center gap-2 self-center rounded-full bg-amber-100 px-3 py-1.5 dark:bg-amber-900/30">
            <Ionicons name="shield-checkmark" size={13} color="#b45309" />
            <Text className="text-[11px] font-semibold text-amber-800 dark:text-amber-200">Meet in a public spot on campus. Pay after checking the item.</Text>
          </View>
          {messages.length === 0 && (
            <Text className="mt-6 text-center text-[14px] text-ink/50 dark:text-white/50">
              Say hi to {c.other.name.split(" ")[0]} 👋{"\n"}Ask a question or make an offer.
            </Text>
          )}
          {messages.map((m) => m.offer_price
            ? <OfferBubble key={m.id} m={m} canDecide={c.i_am_seller && m.offer_status === "pending" && active}
                busy={decide.isPending} onDecide={(accept) => decide.mutate({ messageId: m.id, accept })} />
            : <TextBubble key={m.id} m={m} />)}
        </ScrollView>

        {messages.length === 0 && !c.i_am_seller && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }}
            contentContainerStyle={{ gap: 8, paddingBottom: 8, alignItems: "center" }}>
            {QUICK.map((s) => (
              <Pressable key={s} onPress={() => submit(s)} accessibilityRole="button"
                className="self-center rounded-full border border-brand-200 bg-brand-50 px-3.5 py-2 dark:border-brand-800 dark:bg-brand-900/30">
                <Text className="text-[13px] font-semibold text-brand-800 dark:text-brand-200">{s}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <View className="mb-2 flex-row items-end gap-2">
          {!c.i_am_seller && active && (
            <Pressable onPress={() => setOfferOpen(true)} accessibilityRole="button" accessibilityLabel="Make an offer"
              className="h-12 flex-row items-center gap-1 rounded-full bg-amber-100 px-3.5 dark:bg-amber-900/40">
              <Ionicons name="pricetag" size={16} color="#b45309" />
              <Text className="text-[13px] font-extrabold text-amber-800 dark:text-amber-200">Offer</Text>
            </Pressable>
          )}
          <View className="flex-1 flex-row items-end rounded-3xl border border-ink/10 bg-white p-1 pl-4 dark:border-white/10 dark:bg-night-card">
            <TextInput value={text} onChangeText={setText} placeholder="Message…" placeholderTextColor="#999" multiline maxLength={1000}
              accessibilityLabel="Message" onSubmitEditing={() => submit(text)} blurOnSubmit={false}
              onKeyPress={(e: any) => { if (Platform.OS === "web" && e.nativeEvent.key === "Enter" && !e.nativeEvent.shiftKey) { e.preventDefault?.(); submit(text); } }}
              className="max-h-28 flex-1 py-2.5 text-[15px] text-ink dark:text-white" style={{ outlineStyle: "none" } as any} />
            <Pressable onPress={() => submit(text)} disabled={!text.trim() || send.isPending} accessibilityRole="button" accessibilityLabel="Send"
              className={`h-10 w-10 items-center justify-center rounded-full ${text.trim() ? "bg-brand-500" : "bg-ink/15 dark:bg-white/15"}`}>
              {send.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="arrow-up" size={20} color="#fff" />}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <OfferSheet open={offerOpen} onClose={() => setOfferOpen(false)} price={c.listing.price} fair={c.listing.suggested_price}
        busy={send.isPending} onSend={(offer, body) => send.mutate({ offer, body }, { onSuccess: () => setOfferOpen(false) })} />
    </Screen>
  );
}

function TextBubble({ m }: { m: ThreadMessage }) {
  return (
    <View className={`max-w-[82%] ${m.mine ? "self-end" : "self-start"}`}>
      <View className={`rounded-3xl px-4 py-2.5 ${m.mine ? "rounded-br-md bg-brand-500" : "rounded-bl-md bg-white dark:bg-night-card"}`}>
        <Text className={`text-[15px] leading-[21px] ${m.mine ? "text-white" : "text-ink dark:text-white"}`}>{m.body}</Text>
      </View>
      <Text className={`mt-0.5 text-[10px] text-ink/40 dark:text-white/40 ${m.mine ? "text-right" : ""}`}>{timeAgo(m.created_at)}</Text>
    </View>
  );
}

function OfferBubble({ m, canDecide, busy, onDecide }: { m: ThreadMessage; canDecide: boolean; busy: boolean; onDecide: (accept: boolean) => void }) {
  const status = {
    pending: ["Waiting for reply", "text-amber-700 dark:text-amber-300"],
    accepted: ["Accepted ✓", "text-emerald-700 dark:text-emerald-300"],
    declined: ["Declined", "text-ink/50 dark:text-white/50"],
  }[m.offer_status ?? "pending"];
  return (
    <View className={`w-[78%] ${m.mine ? "self-end" : "self-start"}`}>
      <View className="rounded-3xl border-2 border-amber-300 bg-amber-50 p-3.5 dark:border-amber-700 dark:bg-amber-950/30">
        <View className="flex-row items-center justify-between">
          <Text className="text-[11px] font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-300">
            {m.mine ? "Your offer" : "Offer"}
          </Text>
          {m.offer_label ? <FairPill label={m.offer_label} /> : null}
        </View>
        <Text className="mt-1 text-[28px] font-extrabold text-ink dark:text-white">{inr(m.offer_price!)}</Text>
        {m.body ? <Text className="text-[14px] text-ink/80 dark:text-white/80">{m.body}</Text> : null}
        <Text className={`mt-1 text-[12px] font-bold ${status[1]}`}>{status[0]}</Text>
        {canDecide && (
          <View className="mt-2 flex-row gap-2">
            <View className="flex-1"><Button small title="Decline" variant="secondary" disabled={busy} onPress={() => onDecide(false)} /></View>
            <View className="flex-1"><Button small title="Accept" icon="checkmark" disabled={busy} onPress={() => onDecide(true)} /></View>
          </View>
        )}
      </View>
      <Text className={`mt-0.5 text-[10px] text-ink/40 dark:text-white/40 ${m.mine ? "text-right" : ""}`}>{timeAgo(m.created_at)}</Text>
    </View>
  );
}

function OfferSheet({ open, onClose, price, fair, busy, onSend }: {
  open: boolean; onClose: () => void; price: number; fair: number; busy: boolean; onSend: (offer: number, body: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => { if (open) { setAmount(String(Math.round((Math.min(price, fair) * 0.95) / 10) * 10)); setNote(""); } }, [open, price, fair]);
  const n = parseNumber(amount);
  const r = n && fair ? n / fair : 1;
  const label = r <= 0.9 ? "steal" : r <= 1.12 ? "fair" : "pricey";
  return (
    <Modal transparent animationType="slide" visible={open} onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
        <Pressable className="rounded-t-3xl bg-white p-5 pb-8 dark:bg-night-card" onPress={() => {}}>
          <View className="mb-3 h-1.5 w-10 self-center rounded-full bg-ink/15 dark:bg-white/20" />
          <Text className="text-[20px] font-extrabold text-ink dark:text-white">Make an offer</Text>
          <Text className="text-[13px] text-ink/60 dark:text-white/60">Asking {inr(price)} · fair price {inr(fair)}</Text>
          <View className="mt-4 flex-row items-center gap-2 rounded-2xl border border-ink/10 px-4 dark:border-white/15">
            <Text className="text-[26px] font-extrabold text-ink dark:text-white">₹</Text>
            <TextInput value={amount} onChangeText={setAmount} keyboardType="number-pad" accessibilityLabel="Offer amount" autoFocus
              className="min-w-0 flex-1 py-3 text-[26px] font-extrabold text-ink dark:text-white" style={{ outlineStyle: "none" } as any} />
          </View>
          {n ? (
            <View className="mt-2 flex-row items-center gap-2">
              <FairPill label={label} />
              <Text className="flex-1 text-[12px] text-ink/60 dark:text-white/60">{HINT[label]}</Text>
            </View>
          ) : null}
          <TextInput value={note} onChangeText={setNote} placeholder="Add a note (optional)" placeholderTextColor="#999" maxLength={300}
            className="mt-3 rounded-2xl border border-ink/10 px-4 py-3 text-[15px] text-ink dark:border-white/15 dark:text-white" />
          <View className="mt-4">
            <Button title={n ? `Send offer of ${inr(n)}` : "Enter an amount"} icon="pricetag" loading={busy} disabled={!n || n <= 0}
              onPress={() => n && onSend(n, note.trim())} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
