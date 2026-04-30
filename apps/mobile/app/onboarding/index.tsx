import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useSharedValue,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

import { BookPage, FireflyDot, moon, night, star } from '@ioknbo/ui';

const { width: W, height: H } = Dimensions.get('window');

const PAGES = [
  {
    emoji: '🌙',
    headline: "It's okay to not be okay.",
    body: 'This is not a finance app. It is a quiet space where your money tells your story — gently, without judgment.',
  },
  {
    emoji: '📖',
    headline: 'Write your entries.',
    body: 'Log spending like diary entries. Scan receipts, speak your thoughts, or type a few words. Every transaction has a feeling.',
  },
  {
    emoji: '✦',
    headline: 'See your sky.',
    body: 'Your spending becomes a constellation. Watch patterns emerge across categories — not as warnings, but as chapters.',
  },
  {
    emoji: '🌳',
    headline: 'Grow your tree.',
    body: 'Each savings goal is a branch. The more you save, the more your tree blooms. Fireflies appear at milestones.',
  },
  {
    emoji: '🤍',
    headline: "Let's begin.",
    body: 'Sign in to start your financial story. Your data is private, encrypted, and always yours.',
    cta: true,
  },
];

/**
 * Animated onboarding — a storybook that unfolds across pages.
 * Page-turn animation driven by Reanimated 3 shared values.
 */
export default function OnboardingScreen() {
  const [pageIndex, setPageIndex] = useState(0);
  const router = useRouter();
  const turnProgress = useSharedValue(0);

  const goNext = () => {
    if (pageIndex < PAGES.length - 1) {
      turnProgress.value = withTiming(
        1,
        { duration: 500, easing: Easing.inOut(Easing.cubic) },
        (finished) => {
          if (finished) {
            runOnJS(setPageIndex)((i) => i + 1);
            turnProgress.value = 0;
          }
        },
      );
    }
  };

  const page = PAGES[pageIndex];

  // Firefly positions — deterministic
  const fireflies = FIREFLY_POSITIONS;

  return (
    <SafeAreaView style={styles.root}>
      {/* Night sky background fireflies */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        {fireflies.map((f, i) => (
          <FireflyDot key={i} x={f.x} y={f.y} size={f.size} phaseOffset={f.phase} />
        ))}
      </View>

      {/* Book page */}
      <View style={styles.bookWrap}>
        <BookPage turnProgress={turnProgress}>
          <View style={styles.pageContent}>
            <Text style={styles.emoji}>{page.emoji}</Text>
            <Text style={styles.headline}>{page.headline}</Text>
            <Text style={styles.body}>{page.body}</Text>
          </View>
        </BookPage>
      </View>

      {/* Page dots */}
      <View style={styles.dots}>
        {PAGES.map((_, i) => (
          <View key={i} style={[styles.dot, i === pageIndex && styles.dotActive]} />
        ))}
      </View>

      {/* CTA */}
      {page.cta ? (
        <Pressable style={styles.ctaButton} onPress={() => router.replace('/(auth)/sign-in')}>
          <Text style={styles.ctaText}>Begin My Story</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.nextButton} onPress={goNext}>
          <Text style={styles.nextText}>Turn the page →</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const FIREFLY_POSITIONS = Array.from({ length: 18 }, (_, i) => ({
  x: (((i * 137.5) % 100) + 2) / 100,
  y: (((i * 79.3) % 100) + 2) / 100,
  size: 2 + ((i * 31) % 3),
  phase: i * 230,
}));

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: night[900],
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookWrap: {
    width: W - 48,
    height: H * 0.52,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 10 },
    elevation: 20,
  },
  pageContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    padding: 8,
  },
  emoji: { fontSize: 56 },
  headline: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 22,
    color: night[800],
    textAlign: 'center',
    lineHeight: 30,
  },
  body: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    color: night[700],
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 28,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dotActive: { backgroundColor: star[400], width: 18 },
  nextButton: { marginTop: 24 },
  nextText: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 14,
    color: moon[300],
  },
  ctaButton: {
    marginTop: 24,
    backgroundColor: star[500],
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 30,
  },
  ctaText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
    color: '#fff',
  },
});
