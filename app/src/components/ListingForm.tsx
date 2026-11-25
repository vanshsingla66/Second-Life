import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, View } from "react-native";

import { PhotoPicker, usePhotos } from "@/components/PhotoPicker";
import { PriceSuggestionCard } from "@/components/PriceCard";
import { useToast } from "@/components/Toast";
import { Button, Card, Chip, FairMeter, Field, FairPill, SectionTitle } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { CONDITION_LABEL, categoryLabel, emojiFor, inr, parseNumber } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import { useAiStatus, useMeta } from "@/lib/queries";
import { pricingFairLabel } from "@/lib/fair";
import type { Condition, Identified, Listing } from "@/lib/types";

interface Props { existing?: Listing }

export function ListingForm({ existing }: Props) {
  const toast = useToast();
  const qc = useQueryClient();
  const meta = useMeta();
  const editing = !!existing;

  const [title, setTitle] = useState(existing?.title ?? "");
  const [category, setCategory] = useState<string | undefined>(existing?.category);
  const [condition, setCondition] = useState<Condition | undefined>(existing?.condition);
  const [age, setAge] = useState(existing ? String(existing.age_years) : "");
  const [original, setOriginal] = useState(existing ? String(existing.original_price) : "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const aiStatus = useAiStatus();
  const aiOn = !!aiStatus.data?.enabled;
  const [ai, setAi] = useState<Identified | null>(null);
  const [aiFilled, setAiFilled] = useState<string[]>([]);

  // AI recognition: fills the empty fields from the photos. Refs so the upload callback sees current values.
  const fields = useRef({ title, category, condition, original, description });
  fields.current = { title, category, condition, original, description };
  const identify = useMutation({
    mutationFn: (urls: string[]) => api.identify(urls.slice(0, 3)),
    onSuccess: (r, _urls) => {
      setAi(r);
      if (!r.is_product) { toast.show("Couldn't spot a product in that photo. Try a clearer shot.", "error"); return; }
      applyAi(r, false);
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  function applyAi(r: Identified, overwrite: boolean) {
    const f = fields.current;
    const filled: string[] = [];
    if (r.title && (overwrite || !f.title.trim())) { setTitle(r.title.slice(0, 120)); filled.push("title"); }
    if (r.category && !editing && (overwrite || !f.category)) { setCategory(r.category); filled.push("category"); }
    if (r.condition && (overwrite || !f.condition)) { setCondition(r.condition); filled.push("condition"); }
    if (r.original_price_inr && (overwrite || !f.original.trim())) { setOriginal(String(r.original_price_inr)); filled.push("original price"); }
    const desc = [r.description, r.highlights.length ? `Highlights: ${r.highlights.join(", ")}.` : ""].filter(Boolean).join(" ");
    if (desc && (overwrite || !f.description.trim())) { setDescription(desc.slice(0, 1000)); filled.push("description"); }
    setAiFilled(filled);
    if (filled.length) toast.show(`✨ AI filled in ${filled.join(", ")}`, "success");
  }

  const photos = usePhotos(existing?.image_urls ?? (existing?.image_url ? [existing.image_url] : []), (urls) => {
    // first photo of a new listing: identify automatically
    if (aiOn && !editing && !ai && !identify.isPending && !fields.current.title.trim()) identify.mutate(urls);
  });
  const [override, setOverride] = useState<number | null>(existing ? existing.price : null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const ageN = parseNumber(age);
  const origN = parseNumber(original);
  const ready = !!category && !!condition && ageN !== null && ageN >= 0 && ageN <= 30 && origN !== null && origN > 0;

  // live price suggestion, debounced so we don't call the API on every keystroke
  const key = useDebounced(`${category}|${condition}|${ageN}|${origN}`, 400);
  const suggestionQuery = useQuery({
    queryKey: ["suggest", key],
    enabled: ready,
    placeholderData: (prev) => prev,
    queryFn: () => api.suggest({ category: category!, condition: condition!, age_years: ageN!, original_price: origN! }),
  });
  const suggestion = ready ? suggestionQuery.data : undefined;
  const price = override ?? suggestion?.suggested_price ?? null;

  const slider = useMemo(() => {
    if (!suggestion) return null;
    const lo = Math.max(10, Math.round((suggestion.suggested_price * 0.5) / 10) * 10);
    const hi = Math.max(lo + 10, Math.round(((origN ?? suggestion.suggested_price) * 1.0) / 10) * 10);
    return { lo, hi };
  }, [suggestion, origN]);

  const save = useMutation({
    mutationFn: async () => {
      const image_urls = photos.urls;
      if (editing) {
        return api.updateListing(existing!.id, {
          title: title.trim(), condition, age_years: ageN!, original_price: origN!, price: price ?? undefined,
          description: description.trim(), image_urls,
        });
      }
      return api.createListing({
        title: title.trim(), category: category!, condition: condition!, age_years: ageN!, original_price: origN!,
        price: price ?? undefined, description: description.trim(), image_urls,
      });
    },
    onSuccess: (l) => {
      qc.invalidateQueries({ queryKey: ["listings"] });
      qc.invalidateQueries({ queryKey: ["my-listings"] });
      qc.invalidateQueries({ queryKey: ["listing", l.id] });
      toast.show(editing ? "Listing updated" : "Listed! Juniors can see it now 🎉", "success");
      if (!editing) {
        setTitle(""); setCategory(undefined); setCondition(undefined); setAge(""); setOriginal("");
        setDescription(""); photos.reset(); setOverride(null); setAi(null); setAiFilled([]);
      }
      router.replace(`/listing/${l.id}`);
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  function submit() {
    const next: Record<string, string> = {};
    if (title.trim().length < 2) next.title = "Give your item a name";
    if (!category) next.category = "Pick a category";
    if (!condition) next.condition = "Pick a condition";
    if (ageN === null || ageN < 0 || ageN > 30) next.age = "Enter the age in years (0–30)";
    if (origN === null || origN <= 0) next.original = "Enter what you paid originally (more than ₹0)";
    if (price !== null && price <= 0) next.price = "Price must be more than ₹0";
    setErrors(next);
    if (Object.keys(next).length) { toast.show("Please fix the highlighted fields", "error"); return; }
    if (photos.uploading) { toast.show("Wait a moment, photos are still uploading", "info"); return; }
    save.mutate();
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <PhotoPicker ctl={photos} placeholderEmoji={category ? emojiFor(category) : "📷"} />

      {aiOn && photos.urls.length > 0 && (
        <AiCard result={ai} filled={aiFilled} loading={identify.isPending}
          onIdentify={() => identify.mutate(photos.urls)} onApplyAll={() => ai && applyAi(ai, true)} />
      )}

      <Field label="What are you selling?" value={title} onChangeText={setTitle} error={errors.title} placeholder="e.g. Scientific calculator fx-991" maxLength={120} />

      <Text className="mb-1.5 text-[13px] font-bold text-ink/70 dark:text-white/70">Category</Text>
      <View className="mb-1 flex-row flex-wrap gap-y-2">
        {meta.data?.categories.map((c) => (
          <Chip key={c.id} label={c.label} emoji={emojiFor(c.id)} selected={category === c.id}
            onPress={() => !editing && setCategory(c.id)} />
        ))}
      </View>
      {errors.category ? <Text className="mb-2 text-[13px] font-medium text-red-600">{errors.category}</Text> : <View className="mb-2" />}

      <Text className="mb-1.5 text-[13px] font-bold text-ink/70 dark:text-white/70">Condition</Text>
      <View className="mb-1 flex-row flex-wrap gap-y-2">
        {meta.data?.conditions.map((c) => <Chip key={c.id} label={CONDITION_LABEL[c.id]} selected={condition === c.id} onPress={() => setCondition(c.id)} />)}
      </View>
      {errors.condition ? <Text className="mb-2 text-[13px] font-medium text-red-600">{errors.condition}</Text> : <View className="mb-2" />}

      <View className="flex-row gap-3">
        <View className="flex-1"><Field label="Age (years)" value={age} onChangeText={setAge} error={errors.age} keyboardType="decimal-pad" placeholder="2" /></View>
        <View className="flex-1"><Field label="Original price (₹)" value={original} onChangeText={setOriginal} error={errors.original} keyboardType="number-pad" placeholder="1200" /></View>
      </View>

      {!ready && (
        <Card className="mb-3 flex-row items-center gap-3 bg-brand-50 dark:bg-brand-900/20">
          <Text style={{ fontSize: 28 }}>💡</Text>
          <Text className="flex-1 text-[14px] text-ink/70 dark:text-white/70">
            Fill in category, condition, age and original price and we'll suggest a fair price instantly.
          </Text>
        </Card>
      )}

      {ready && !suggestion && suggestionQuery.isError && (
        <Card className="mb-3 border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30">
          <Text className="text-[14px] text-red-700 dark:text-red-300">{errorMessage(suggestionQuery.error)}</Text>
          <Text onPress={() => suggestionQuery.refetch()} className="mt-1 font-bold text-red-700 dark:text-red-300">Try again</Text>
        </Card>
      )}

      {suggestion && <PriceSuggestionCard suggestion={suggestion} loading={suggestionQuery.isFetching} />}

      {suggestion && slider && price !== null && (
        <View className="mt-4">
          <SectionTitle>Your asking price</SectionTitle>
          <Card>
            <View className="flex-row items-center justify-between">
              <Text className="text-[34px] font-extrabold text-ink dark:text-white">{inr(price)}</Text>
              <FairPill label={pricingFairLabel(price, suggestion.suggested_price)} />
            </View>
            <Slider minimumValue={slider.lo} maximumValue={slider.hi} step={10} value={Math.min(Math.max(price, slider.lo), slider.hi)}
              onValueChange={(v) => setOverride(Math.round(v))} minimumTrackTintColor="#22a355" thumbTintColor="#22a355"
              accessibilityLabel="Asking price" style={{ height: 40, marginTop: 6 }} />
            <FairMeter price={price} suggested={suggestion.suggested_price} low={suggestion.low} high={suggestion.high} />
            <View className="mt-3 flex-row items-center justify-between">
              <Text className="flex-1 text-[13px] text-ink/60 dark:text-white/60">
                {override !== null && override !== suggestion.suggested_price ? "You've adjusted the suggested price." : "Using the suggested price."}
              </Text>
              {override !== null && override !== suggestion.suggested_price && (
                <Text onPress={() => setOverride(null)} className="text-[13px] font-bold text-brand-700 dark:text-brand-300">Use suggested</Text>
              )}
            </View>
            {errors.price ? <Text className="mt-1 text-[13px] font-medium text-red-600">{errors.price}</Text> : null}
          </Card>
        </View>
      )}

      <View className="mt-4">
        <Field label="Description (optional)" value={description} onChangeText={setDescription} placeholder="Anything buyers should know?"
          multiline numberOfLines={3} maxLength={1000} style={{ minHeight: 80, textAlignVertical: "top" }} />
      </View>

      <Button title={editing ? "Save changes" : "Post listing"} icon={editing ? "checkmark" : "rocket"} onPress={submit}
        loading={save.isPending || photos.uploading} disabled={ready && !suggestion && suggestionQuery.isLoading} />
      {!editing && <Text className="mt-3 text-center text-[12px] text-ink/50 dark:text-white/50">
        <Ionicons name="shield-checkmark" size={12} /> Listings are public to students on campus.
      </Text>}
    </KeyboardAvoidingView>
  );
}

function AiCard({ result, filled, loading, onIdentify, onApplyAll }: {
  result: Identified | null; filled: string[]; loading: boolean; onIdentify: () => void; onApplyAll: () => void;
}) {
  if (loading) {
    return (
      <Card className="mb-4 flex-row items-center gap-3 border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/30">
        <ActivityIndicator color="#7c3aed" />
        <View className="flex-1">
          <Text className="text-[15px] font-extrabold text-violet-800 dark:text-violet-200">AI is looking at your photo…</Text>
          <Text className="text-[12px] text-violet-700/70 dark:text-violet-200/70">Finding the product, brand and a fair new price</Text>
        </View>
      </Card>
    );
  }
  if (!result || !result.is_product) {
    return (
      <Pressable onPress={onIdentify} accessibilityRole="button" accessibilityLabel="Identify with AI"
        className="mb-4 flex-row items-center gap-3 rounded-3xl border border-violet-200 bg-violet-50 p-4 active:opacity-80 dark:border-violet-900 dark:bg-violet-950/30">
        <Text style={{ fontSize: 26 }}>✨</Text>
        <View className="flex-1">
          <Text className="text-[15px] font-extrabold text-violet-800 dark:text-violet-200">
            {result ? "Try AI again" : "Identify with AI"}
          </Text>
          <Text className="text-[12px] text-violet-700/70 dark:text-violet-200/70">
            {result ? "No product spotted. Try a clearer, closer photo." : "Fill title, brand, category and price from your photos"}
          </Text>
        </View>
        <Ionicons name="sparkles" size={20} color="#7c3aed" />
      </Pressable>
    );
  }
  const conf = { high: "bg-emerald-100 text-emerald-800", medium: "bg-amber-100 text-amber-800", low: "bg-red-100 text-red-800" }[result.confidence];
  return (
    <Card className="mb-4 border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/30">
      <View className="flex-row items-center justify-between">
        <Text className="text-[12px] font-extrabold uppercase tracking-wider text-violet-700 dark:text-violet-300">✨ AI recognised</Text>
        <Text className={`overflow-hidden rounded-full px-2 py-0.5 text-[11px] font-bold ${conf}`}>{result.confidence} confidence</Text>
      </View>
      <Text className="mt-1.5 text-[18px] font-extrabold text-ink dark:text-white">{result.title}</Text>
      <Text className="text-[13px] text-ink/60 dark:text-white/60">
        {[result.brand && `Brand: ${result.brand}`, result.model && `Model: ${result.model}`, result.category && categoryLabel(result.category)].filter(Boolean).join(" · ")}
      </Text>
      {result.original_price_inr ? (
        <Text className="mt-1 text-[13px] text-ink/70 dark:text-white/70">Costs about <Text className="font-bold">{inr(result.original_price_inr)}</Text> new in India</Text>
      ) : null}
      {result.highlights.length > 0 && (
        <View className="mt-2 flex-row flex-wrap gap-1.5">
          {result.highlights.map((h) => (
            <View key={h} className="rounded-full bg-white px-2.5 py-1 dark:bg-white/10"><Text className="text-[12px] text-ink/80 dark:text-white/80">{h}</Text></View>
          ))}
        </View>
      )}
      <Text className="mt-2 text-[12px] text-ink/60 dark:text-white/60">
        {filled.length ? `Filled in: ${filled.join(", ")}. ` : "Your fields were kept. "}Add how old it is to get the fair price.
      </Text>
      <View className="mt-2 flex-row gap-4">
        <Text onPress={onApplyAll} className="text-[13px] font-bold text-violet-700 dark:text-violet-300">Use all AI details</Text>
        <Text onPress={onIdentify} className="text-[13px] font-bold text-violet-700 dark:text-violet-300">Re-scan</Text>
      </View>
    </Card>
  );
}
