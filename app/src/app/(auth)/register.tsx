import { Link } from "expo-router";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { GoogleButton } from "@/auth/GoogleButton";
import { useToast } from "@/components/Toast";
import { Button, Field, Screen } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { googleConfigured } from "@/lib/config";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Register() {
  const { register } = useAuth();
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = "Tell us your name";
    if (!EMAIL_RE.test(email.trim())) next.email = "Enter a valid email address";
    if (password.length < 8) next.password = "Use at least 8 characters";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await register(name, email, password);
    } catch (err) {
      toast.show(errorMessage(err), "error");
      setBusy(false);
    }
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View className="items-center pb-4 pt-8">
          <Text style={{ fontSize: 56 }}>♻️</Text>
          <Text className="mt-1 text-[28px] font-extrabold text-ink dark:text-white">Join the campus swap</Text>
          <Text className="text-[15px] text-ink/60 dark:text-white/60">It takes less than a minute</Text>
        </View>
        <Field label="Name" value={name} onChangeText={setName} error={errors.name} autoComplete="name" placeholder="Your name" />
        <Field label="Email" value={email} onChangeText={setEmail} error={errors.email} autoCapitalize="none"
          keyboardType="email-address" autoComplete="email" placeholder="you@college.edu" />
        <Field label="Password" value={password} onChangeText={setPassword} error={errors.password} secureTextEntry
          autoComplete="new-password" placeholder="At least 8 characters" hint="Use a unique password you don't use elsewhere." onSubmitEditing={submit} />
        <Button title="Create account" onPress={submit} loading={busy} />
        {googleConfigured && (
          <>
            <View className="my-4 flex-row items-center gap-3">
              <View className="h-px flex-1 bg-brand-200 dark:bg-night-line" />
              <Text className="text-[13px] text-ink/50 dark:text-white/50">or</Text>
              <View className="h-px flex-1 bg-brand-200 dark:bg-night-line" />
            </View>
            <GoogleButton />
          </>
        )}
        <View className="mt-6 flex-row justify-center gap-1">
          <Text className="text-ink/60 dark:text-white/60">Already have an account?</Text>
          <Link href="/login" replace><Text className="font-bold text-brand-600">Sign in</Text></Link>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
