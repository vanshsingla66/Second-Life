import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import React from "react";

import { ListingForm } from "@/components/ListingForm";
import { ErrorState, Header, RowSkeleton, Screen } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

export default function EditListing() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ["listing", Number(id)], queryFn: () => api.listing(Number(id)) });
  return (
    <Screen edges={["top", "bottom"]}>
      <Header title="Edit listing" onBack />
      {q.isLoading ? <RowSkeleton /> : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> :
        q.data ? <ListingForm existing={q.data} /> : null}
    </Screen>
  );
}
