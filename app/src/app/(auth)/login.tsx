import { Link } from "expo-router";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { GoogleButton } from "@/auth/GoogleButton";
import { useToast } from "@/components/Toast";
import { Button, Field, Header, Screen } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { googleConfigured } from "@/lib/config";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  async function submit(e = email, p = password) {
    const next: typeof errors = {};
    if (!EMAIL_RE.test(e.trim())) next.email = "Enter a valid email address";
    if (!p) next.password = "Enter your password";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await login(e, p);
    } catch (err) {
      toast.show(errorMessage(err), "error");
      setBusy(false);
    }
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View className="items-center pb-4 pt-8">
          <Text style={{ fontSize: 56 }}>🌿</Text>
          <Text className="mt-1 text-[28px] font-extrabold text-ink dark:text-white">Welcome back</Text>
          <Text className="text-[15px] text-ink/60 dark:text-white/60">Sign in to GREEN · Second Life</Text>
        </View>
        <Field label="Email" value={email} onChangeText={setEmail} error={errors.email} autoCapitalize="none"
          keyboardType="email-address" autoComplete="email" textContentType="emailAddress" placeholder="you@college.edu" />
        <Field label="Password" value={password} onChangeText={setPassword} error={errors.password} secureTextEntry={!show}
          autoComplete="password" textContentType="password" placeholder="Your password" onSubmitEditing={() => submit()} />
        <Pressable onPress={() => setShow((s) => !s)} className="-mt-1 mb-3 self-end">
          <Text className="text-[13px] font-semibold text-brand-700 dark:text-brand-300">{show ? "Hide" : "Show"} password</Text>
        </Pressable>
        <Button title="Sign in" onPress={() => submit()} loading={busy} />
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
        <View className="mt-5 rounded-2xl bg-brand-100 p-3 dark:bg-brand-900/40">
          <Text className="text-[13px] text-brand-800 dark:text-brand-200">Just looking around? Use the demo account.</Text>
          <Text onPress={() => { setEmail("demo@example.com"); setPassword("Demo@1234"); submit("demo@example.com", "Demo@1234"); }}
            className="mt-1 text-[14px] font-bold text-brand-700 dark:text-brand-300">Sign in as Demo Student →</Text>
        </View>
        <View className="mt-6 flex-row justify-center gap-1">
          <Text className="text-ink/60 dark:text-white/60">New here?</Text>
          <Link href="/register" replace><Text className="font-bold text-brand-600">Create an account</Text></Link>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
