import {
  Canvas,
  Circle,
  Group,
  Paint,
  Path,
  Skia,
  useClockValue,
  useComputedValue,
} from '@shopify/react-native-skia';
import React, { useMemo, useState } from 'react';
import { Dimensions, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { useTransactions } from '@ioknbo/api-client';
import { moon, night, star } from '@ioknbo/ui';
import type { Transaction, TransactionCategory } from '@ioknbo/api-client';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CANVAS_H = SCREEN_H * 0.6;

// Map each spending category to a colour
const CATEGORY_COLORS: Record<TransactionCategory, string> = {
  needs: '#8AABFF',
  wants: '#FFB266',
  savings: '#84D494',
  debt_payment: '#FF8C33',
  income: '#4FBA64',
  transfer: '#B8CCFF',
};

// Deterministic position for category clusters
const CLUSTER_POSITIONS: Record<TransactionCategory, { cx: number; cy: number }> = {
  needs: { cx: 0.25, cy: 0.35 },
  wants: { cx: 0.65, cy: 0.25 },
  savings: { cx: 0.75, cy: 0.65 },
  income: { cx: 0.15, cy: 0.7 },
  debt_payment: { cx: 0.5, cy: 0.5 },
  transfer: { cx: 0.45, cy: 0.2 },
};

interface StarPoint {
  x: number;
  y: number;
  r: number;
  color: string;
  category: TransactionCategory;
  amount: number;
}

/**
 * Constellations tab — spending visualised as a star map.
 * Each category forms its own cluster; star size = transaction amount.
 */
export default function ConstellationsScreen() {
  const { data } = useTransactions({ limit: 100 });
  const clock = useClockValue();

  const stars = useMemo<StarPoint[]>(() => {
    if (!data?.data) return [];
    return data.data
      .filter((t) => t.category !== 'income')
      .map((t: Transaction) => {
        const cluster = CLUSTER_POSITIONS[t.category];
        const spread = 0.12;
        // Pseudo-random spread within cluster using transaction id hash
        const hash = t.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
        const angle = (hash % 360) * (Math.PI / 180);
        const dist = ((hash % 100) / 100) * spread;
        return {
          x: (cluster.cx + Math.cos(angle) * dist) * SCREEN_W,
          y: (cluster.cy + Math.sin(angle) * dist) * CANVAS_H,
          r: Math.min(3 + t.amount / 1000, 12),
          color: CATEGORY_COLORS[t.category],
          category: t.category,
          amount: t.amount,
        };
      });
  }, [data]);

  // Animated global twinkle — each star pulses independently via clock
  const starOpacity = useComputedValue(() => {
    return 0.7 + 0.3 * Math.sin(clock.current / 1200);
  }, [clock]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Night Sky</Text>
        <Text style={styles.subtitle}>Your spending as constellations</Text>
      </View>

      <Canvas style={{ width: SCREEN_W, height: CANVAS_H }}>
        {/* Background stars (static, decorative) */}
        {BACKGROUND_STARS.map((s, i) => (
          <Circle key={i} cx={s.x * SCREEN_W} cy={s.y * CANVAS_H} r={s.r} color={s.color} opacity={0.3} />
        ))}

        {/* Transaction star clusters */}
        {stars.map((s, i) => (
          <Group key={i} opacity={starOpacity}>
            {/* Glow halo */}
            <Circle cx={s.x} cy={s.y} r={s.r * 2.5} color={s.color} opacity={0.15} />
            {/* Star body */}
            <Circle cx={s.x} cy={s.y} r={s.r} color={s.color} />
          </Group>
        ))}
      </Canvas>

      {/* Category legend */}
      <View style={styles.legend}>
        {(Object.entries(CATEGORY_COLORS) as [TransactionCategory, string][])
          .filter(([cat]) => cat !== 'income' && cat !== 'transfer')
          .map(([cat, color]) => (
            <View key={cat} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: color }]} />
              <Text style={styles.legendLabel}>{cat}</Text>
            </View>
          ))}
      </View>
    </SafeAreaView>
  );
}

// A fixed set of decorative background stars
const BACKGROUND_STARS = Array.from({ length: 80 }, (_, i) => ({
  x: (((i * 137.5) % 100) + 0.5) / 100,
  y: (((i * 97.3) % 100) + 0.5) / 100,
  r: 0.5 + ((i * 31) % 100) / 100,
  color: moon[50],
}));

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: night[950] },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 28,
    color: moon[50],
  },
  subtitle: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    color: moon[400],
    marginTop: 4,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 12,
    marginTop: 16,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 11,
    color: moon[300],
    textTransform: 'capitalize',
  },
});
