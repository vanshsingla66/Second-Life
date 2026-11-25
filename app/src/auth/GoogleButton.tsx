import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect } from "react";

import { Button } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { errorMessage } from "@/lib/api";
import { GOOGLE, googleConfigured } from "@/lib/config";
import { useAuth } from "./AuthContext";

WebBrowser.maybeCompleteAuthSession();

/**
 * The Google provider hook throws when this platform's client id is missing, so the hook lives in an inner
 * component that is only mounted when Google is configured. Otherwise the button is simply hidden.
 */
export function GoogleButton() {
  return googleConfigured ? <GoogleButtonInner /> : null;
}

function GoogleButtonInner() {
  const { googleLogin } = useAuth();
  const toast = useToast();
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: GOOGLE.webClientId,
    androidClientId: GOOGLE.androidClientId,
    iosClientId: GOOGLE.iosClientId,
  });

  useEffect(() => {
    if (response?.type === "success") {
      const idToken = response.params?.id_token ?? response.authentication?.idToken;
      if (!idToken) { toast.show("Google didn't return an ID token. Try again.", "error"); return; }
      googleLogin(idToken).catch((e) => toast.show(errorMessage(e), "error"));
    } else if (response?.type === "error") {
      toast.show(response.error?.message ?? "Google sign-in failed.", "error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  return (
    <Button title="Continue with Google" icon="logo-google" variant="secondary" disabled={!request}
      onPress={() => promptAsync()} />
  );
}
