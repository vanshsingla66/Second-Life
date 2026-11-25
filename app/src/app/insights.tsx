import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";

import { Card, Chip, ErrorState, Header, RowSkeleton, Screen, SectionTitle, useIsDark } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { emojiFor } from "@/lib/format";

const COLORS = ["#22a355", "#f59e0b", "#3b82f6", "#ec4899", "#8b5cf6", "#ef4444"];
const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

function LineChart({ curves, selected, colors }: { curves: Record<string, { age: number; retention: number }[]>; selected: string[]; colors: Record<string, string> }) {
  const dark = useIsDark();
  const [w, setW] = useState(320);
  const h = 220, pl = 36, pr = 12, pt = 12, pb = 28;
  const x = (age: number) => pl + (age / 5) * (w - pl - pr);
  const y = (r: number) => pt + (1 - r) * (h - pt - pb);
  const axis = dark ? "#ffffff66" : "#14231a77";
  const grid = dark ? "#ffffff18" : "#14231a14";
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Svg width={w} height={h} accessibilityLabel="Chart of how much value each category keeps by age">
        {[0, 0.25, 0.5, 0.75, 1].map((r) => (
          <React.Fragment key={r}>
            <Line x1={pl} x2={w - pr} y1={y(r)} y2={y(r)} stroke={grid} />
            <SvgText x={pl - 6} y={y(r) + 4} fontSize={10} fill={axis} textAnchor="end">{Math.round(r * 100)}%</SvgText>
          </React.Fragment>
        ))}
        {[0, 1, 2, 3, 4, 5].map((a) => <SvgText key={a} x={x(a)} y={h - 8} fontSize={10} fill={axis} textAnchor="middle">{a}y</SvgText>)}
        {selected.map((c) => {
          const pts = curves[c] ?? [];
          const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.age).toFixed(1)},${y(p.retention).toFixed(1)}`).join(" ");
          return (
            <React.Fragment key={c}>
              <Path d={d} stroke={colors[c]} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              {pts.filter((p) => [1, 2, 4].includes(p.age)).map((p) => <Circle key={p.age} cx={x(p.age)} cy={y(p.retention)} r={3.5} fill={colors[c]} />)}
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

export default function Insights() {
  const q = useQuery({ queryKey: ["insights"], queryFn: api.insights, staleTime: 5 * 60_000 });
  const [off, setOff] = useState<string[]>([]);
  const cats = q.data ? Object.keys(q.data.curves) : [];
  const colors = Object.fromEntries(cats.map((c, i) => [c, COLORS[i % COLORS.length]]));
  const selected = cats.filter((c) => !off.includes(c));
  const maxLoss = Math.max(...(q.data?.categories.map((c) => c.yearly_loss_pct) ?? [1]));

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Header title="Price insights" subtitle="What past campus sales tell us" onBack />
      {q.isLoading ? <RowSkeleton /> : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : q.data && (
        <>
          <Card className="bg-brand-600 dark:bg-brand-700">
            <Text className="text-[12px] font-bold uppercase tracking-widest text-white/70">Key insight</Text>
            <Text className="mt-1 text-[19px] font-extrabold leading-6 text-white">{q.data.headline}</Text>
          </Card>

          <SectionTitle>How much value items keep (good condition)</SectionTitle>
          <Card>
            <LineChart curves={q.data.curves} selected={selected} colors={colors} />
            <View className="mt-3 flex-row flex-wrap gap-y-2">
              {q.data.categories.map((c) => {
                const on = !off.includes(c.category);
                return (
                  <Chip key={c.category} label={c.label} emoji={emojiFor(c.category)} dot={colors[c.category]} selected={on}
                    onPress={() => setOff(on ? [...off, c.category] : off.filter((x) => x !== c.category))} />
                );
              })}
            </View>
          </Card>

          <SectionTitle>Yearly value lost</SectionTitle>
          <Card className="gap-3">
            {q.data.categories.map((c) => (
              <View key={c.category}>
                <View className="mb-1 flex-row justify-between">
                  <Text className="text-[14px] font-semibold text-ink dark:text-white">{emojiFor(c.category)} {c.label}</Text>
                  <Text className="text-[14px] font-bold text-ink dark:text-white">{c.yearly_loss_pct.toFixed(0)}% / yr</Text>
                </View>
                <View className="h-2.5 overflow-hidden rounded-full bg-brand-100 dark:bg-night-line">
                  <View style={{ width: `${(c.yearly_loss_pct / maxLoss) * 100}%`, backgroundColor: colors[c.category] }} className="h-full rounded-full" />
                </View>
                <Text className="mt-0.5 text-[11px] text-ink/50 dark:text-white/50">Keeps {Math.round(c.retention_2y * 100)}% after 2 years · {c.n} past sales</Text>
              </View>
            ))}
          </Card>

          <SectionTitle>Best time to sell</SectionTitle>
          <Card>
            <View className="h-24 flex-row items-end justify-between gap-1">
              {q.data.season.map((m) => (
                <View key={m.month} className="flex-1 items-center">
                  <View style={{ height: Math.max(8, (m.factor - 0.85) * 330) }}
                    className={`w-full rounded-t-lg ${m.factor >= 1.03 ? "bg-brand-500" : "bg-brand-200 dark:bg-night-line"}`} />
                  <Text className="mt-1 text-[10px] text-ink/60 dark:text-white/60">{MONTHS[m.month - 1]}</Text>
                </View>
              ))}
            </View>
            <Text className="mt-2 text-[12px] text-ink/60 dark:text-white/60">Prices peak in July–August when juniors arrive, and dip around farewell season.</Text>
          </Card>
        </>
      )}
    </Screen>
  );
}
