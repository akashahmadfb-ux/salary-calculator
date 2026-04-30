import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { star, moon } from '../tokens/colors';

export interface FireflyDotProps {
  /** X position (0–1 relative to parent) */
  x: number;
  /** Y position (0–1 relative to parent) */
  y: number;
  /** Size of the dot in dp (default 4) */
  size?: number;
  /** Colour (default pale star white) */
  color?: string;
  /** Animation phase offset in ms (for staggering) */
  phaseOffset?: number;
  style?: ViewStyle;
}

/**
 * FireflyDot — a single twinkling firefly particle.
 * Place multiple instances over a canvas for the night-sky effect.
 * Combine with a Lottie firefly animation for richer scenes.
 */
export const FireflyDot: React.FC<FireflyDotProps> = ({
  x,
  y,
  size = 4,
  color = moon[50],
  phaseOffset = 0,
  style,
}) => {
  const opacity = useSharedValue(0.2);
  const scale = useSharedValue(0.8);

  React.useEffect(() => {
    // Stagger the start so fireflies don't all pulse in sync
    const timeout = setTimeout(() => {
      opacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 800 + Math.random() * 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.1, { duration: 1200 + Math.random() * 800, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
      scale.value = withRepeat(
        withSequence(
          withTiming(1.4, { duration: 900, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.7, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    }, phaseOffset);
    return () => clearTimeout(timeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.dot,
        {
          left: `${x * 100}%`,
          top: `${y * 100}%`,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          shadowColor: color,
        },
        animStyle,
        style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
});
