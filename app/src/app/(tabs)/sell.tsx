import React from "react";
import { Text } from "react-native";

import { ListingForm } from "@/components/ListingForm";
import { Header, Screen } from "@/components/ui";

export default function Sell() {
  return (
    <Screen>
      <Header title="Sell something" subtitle="List it in under a minute ⏱️" />
      <ListingForm />
    </Screen>
  );
}
