import { Link } from "expo-router";
import React from "react";
import { Text } from "react-native";

import { EmptyState, Screen } from "@/components/ui";

export default function NotFound() {
  return (
    <Screen>
      <EmptyState emoji="🧭" title="This page took a wrong turn" body="We couldn't find what you were looking for."
        action={<Link href="/" replace><Text className="text-center text-[16px] font-bold text-brand-600">Back to the marketplace</Text></Link>} />
    </Screen>
  );
}
