import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import { Text, View } from "react-native";

import { useToast } from "@/components/Toast";
import { Button, Chip, Field, Header, Screen } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { emojiFor, parseNumber } from "@/lib/format";
import { useMeta } from "@/lib/queries";

export default function NewWanted() {
  const toast = useToast();
  const qc = useQueryClient();
  const meta = useMeta();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string | undefined>();
  const [budget, setBudget] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const create = useMutation({
    mutationFn: () => api.createWanted({ title: title.trim(), category: category ?? null, max_price: parseNumber(budget)!, note: note.trim() }),
    onSuccess: (w) => {
      qc.invalidateQueries({ queryKey: ["wanted"] });
      toast.show(w.match_count ? `Posted! ${w.match_count} listing${w.match_count === 1 ? "" : "s"} already match 🎉` : "Posted! We'll show matches as they appear.", "success");
      router.replace(`/wanted/${w.id}`);
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  function submit() {
    const next: Record<string, string> = {};
    const b = parseNumber(budget);
    if (title.trim().length < 2) next.title = "What are you looking for?";
    if (b === null || b <= 0) next.budget = "Enter your maximum budget (more than ₹0)";
    setErrors(next);
    if (Object.keys(next).length === 0) create.mutate();
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <Header title="Post a request" subtitle="Tell sellers what you need" onBack />
      <Field label="I'm looking for" value={title} onChangeText={setTitle} error={errors.title} placeholder="e.g. Cycle for hostel commute" maxLength={120} />
      <Text className="mb-1.5 text-[13px] font-bold text-ink/70 dark:text-white/70">Category (optional)</Text>
      <View className="mb-3 flex-row flex-wrap gap-y-2">
        {meta.data?.categories.map((c) => (
          <Chip key={c.id} label={c.label} emoji={emojiFor(c.id)} selected={category === c.id} onPress={() => setCategory(category === c.id ? undefined : c.id)} />
        ))}
      </View>
      <Field label="Maximum budget (₹)" value={budget} onChangeText={setBudget} error={errors.budget} keyboardType="number-pad" placeholder="3000" />
      <Field label="Notes (optional)" value={note} onChangeText={setNote} placeholder="Any must-haves?" multiline maxLength={500} style={{ minHeight: 70, textAlignVertical: "top" }} />
      <Button title="Post request" icon="megaphone" onPress={submit} loading={create.isPending} />
    </Screen>
  );
}
