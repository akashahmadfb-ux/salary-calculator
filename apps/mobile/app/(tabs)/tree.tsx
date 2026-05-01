import { Canvas, Group, RoundedRect, Circle } from '@shopify/react-native-skia';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import {
  Dimensions,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useSavingsGoals } from '@ioknbo/api-client';
import { GlassCard, LanternGlow, TreeNode, leaf, moon, night, star } from '@ioknbo/ui';
import type { SavingsGoal } from '@ioknbo/api-client';

const CANVAS_W = Dimensions.get('window').width;
const CANVAS_H = 240;

// Fixed branch angles for up to 6 goals
const BRANCH_ANGLES = [-40, 40, -25, 25, -55, 55];

/**
 * Tree tab — savings visualised as a growing tree.
 * Each savings goal is a branch that fills in proportion to its progress.
 */
export default function TreeScreen() {
  const router = useRouter();
  const { data: goals = [] } = useSavingsGoals();

  const branches = useMemo(
    () =>
      goals.map((g: SavingsGoal, i: number) => ({
        goal: g,
        angle: BRANCH_ANGLES[i % BRANCH_ANGLES.length],
        progress: g.target_amount > 0 ? Math.min(g.current_amount / g.target_amount, 1) : 0,
      })),
    [goals],
  );

  const overallProgress =
    goals.length > 0
      ? branches.reduce((sum, b) => sum + b.progress, 0) / branches.length
      : 0;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Savings Tree</Text>
        <Pressable style={styles.addButton} onPress={() => router.push('/savings-goal/new')}>
          <Text style={styles.addIcon}>＋</Text>
        </Pressable>
      </View>

      {/* Skia tree canvas */}
      <View style={styles.canvasWrap}>
        <LanternGlow radius={60} animate={overallProgress > 0.5}>
          <Canvas style={{ width: CANVAS_W, height: CANVAS_H }}>
            {/* Trunk */}
            <RoundedRect
              x={CANVAS_W / 2 - 6}
              y={CANVAS_H * 0.5}
              width={12}
              height={CANVAS_H * 0.45}
              r={6}
              color={leaf[600]}
            />
            {/* Branches */}
            {branches.map((b, i) => (
              <Group key={b.goal.id} transform={[{ translateX: CANVAS_W / 2 }, { translateY: CANVAS_H * 0.5 }]}>
                <RoundedRect
                  x={-4}
                  y={-(b.progress * 70 + 20)}
                  width={8}
                  height={b.progress * 70 + 20}
                  r={4}
                  color={leaf[b.progress > 0.8 ? 400 : 600]}
                  transform={[{ rotate: (b.angle * Math.PI) / 180 }]}
                />
                {/* Leaf dot at tip */}
                {b.progress > 0.1 && (
                  <Circle
                    cx={Math.sin((b.angle * Math.PI) / 180) * (b.progress * 70 + 24)}
                    cy={-(Math.cos((b.angle * Math.PI) / 180) * (b.progress * 70 + 24))}
                    r={6 + b.progress * 4}
                    color={b.progress >= 1 ? '#FFD700' : leaf[300]}
                    opacity={0.85}
                  />
                )}
              </Group>
            ))}
          </Canvas>
        </LanternGlow>
      </View>

      {/* Goal cards */}
      <ScrollView
        contentContainerStyle={styles.goalList}
        showsVerticalScrollIndicator={false}
      >
        {goals.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Plant your first seed.</Text>
            <Text style={styles.emptyHint}>Tap ＋ to add a savings goal.</Text>
          </View>
        )}
        {goals.map((goal: SavingsGoal) => {
          const pct = goal.target_amount > 0
            ? Math.round((goal.current_amount / goal.target_amount) * 100)
            : 0;
          return (
            <Pressable key={goal.id} onPress={() => router.push(`/savings-goal/${goal.id}`)}>
              <GlassCard style={styles.goalCard} padding="md">
                <Text style={styles.goalEmoji}>{goal.branch_emoji}</Text>
                <View style={styles.goalInfo}>
                  <Text style={styles.goalName}>{goal.name}</Text>
                  {goal.deadline && (
                    <Text style={styles.goalDeadline}>
                      by {new Date(goal.deadline).toLocaleDateString('en', { month: 'short', year: 'numeric' })}
                    </Text>
                  )}
                  <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${pct}%` }]} />
                  </View>
                </View>
                <View style={styles.goalRight}>
                  <Text style={styles.goalPct}>{pct}%</Text>
                  <Text style={styles.goalAmount}>
                    {goal.currency} {goal.current_amount.toFixed(0)}/{goal.target_amount.toFixed(0)}
                  </Text>
                </View>
              </GlassCard>
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: night[950] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 28, color: moon[50] },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: leaf[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  addIcon: { color: '#fff', fontSize: 22, lineHeight: 26 },
  canvasWrap: { alignItems: 'center', marginTop: 8 },
  goalList: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  goalCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  goalEmoji: { fontSize: 28 },
  goalInfo: { flex: 1, gap: 4 },
  goalName: { fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: moon[100] },
  goalDeadline: { fontFamily: 'Poppins_400Regular', fontSize: 11, color: moon[400] },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: {
    height: '100%',
    backgroundColor: leaf[400],
    borderRadius: 2,
  },
  goalRight: { alignItems: 'flex-end', gap: 2 },
  goalPct: { fontFamily: 'Poppins_700Bold', fontSize: 15, color: leaf[300] },
  goalAmount: { fontFamily: 'Poppins_400Regular', fontSize: 10, color: moon[400] },
  empty: { alignItems: 'center', paddingTop: 40, gap: 8 },
  emptyText: {
    fontFamily: 'PlayfairDisplay_400Regular_Italic',
    fontSize: 18,
    color: moon[300],
  },
  emptyHint: { fontFamily: 'Poppins_400Regular', fontSize: 13, color: moon[500] },
});
