import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';

import { moon, night } from '../tokens/colors';
import { borderRadius, shadow } from '../tokens/spacing';

export interface BookPageProps {
  children: React.ReactNode;
  /** 0 = fully open (front facing), 1 = fully turned */
  turnProgress?: Animated.SharedValue<number>;
  /** Whether this is the left or right page */
  side?: 'left' | 'right';
  style?: ViewStyle;
}

/**
 * BookPage — a physical book page that can be turned.
 * Used in the onboarding storybook and journal entry screens.
 * Animate `turnProgress` (0 → 1) to trigger the page-turn effect.
 */
export const BookPage: React.FC<BookPageProps> = ({
  children,
  turnProgress,
  side = 'right',
  style,
}) => {
  const internalProgress = useSharedValue(0);
  const progress = turnProgress ?? internalProgress;

  const pageStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(
      progress.value,
      [0, 1],
      side === 'right' ? [0, -180] : [0, 180],
      Extrapolation.CLAMP,
    );
    const scaleX = interpolate(
      progress.value,
      [0, 0.5, 1],
      [1, 0.98, 1],
      Extrapolation.CLAMP,
    );
    return {
      transform: [{ perspective: 1200 }, { rotateY: `${rotateY}deg` }, { scaleX }],
    };
  });

  const shadowStyle = useAnimatedStyle(() => {
    const shadowOpacity = interpolate(progress.value, [0, 0.5, 1], [0.1, 0.35, 0.05], Extrapolation.CLAMP);
    return { shadowOpacity };
  });

  return (
    <Animated.View style={[styles.page, shadow.glass, pageStyle, shadowStyle, style]}>
      <View style={styles.pageInner}>{children}</View>
      {/* Page edge line */}
      <View style={[styles.spine, side === 'right' ? styles.spineLeft : styles.spineRight]} />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: moon[100],
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    backfaceVisibility: 'hidden',
  },
  pageInner: {
    flex: 1,
    padding: 24,
  },
  spine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: night[800],
    opacity: 0.08,
  },
  spineLeft: { left: 0 },
  spineRight: { right: 0 },
});
