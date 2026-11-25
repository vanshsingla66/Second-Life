import { useQuery } from "@tanstack/react-query";

import { api } from "./api";

export const useMeta = () => useQuery({ queryKey: ["meta"], queryFn: api.meta, staleTime: Infinity });
export const useStats = () => useQuery({ queryKey: ["stats"], queryFn: api.stats });

export const useAiStatus = () => useQuery({ queryKey: ["ai-status"], queryFn: api.aiStatus, staleTime: 60_000 });
export const useUnread = () => useQuery({ queryKey: ["unread"], queryFn: api.unread, refetchInterval: 15_000 });
