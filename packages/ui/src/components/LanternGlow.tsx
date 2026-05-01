import React, { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { ember } from '../tokens/colors';

export interface LanternGlowProps {
  /** Glow colour (default warm amber) */
  color?: string;
  /** Outer radius of the glow halo */
  radius?: number;
  /** Whether the glow pulses */
  animate?: boolean;
  style?: ViewStyle;
  children?: React.ReactNode;
}

/**
 * LanternGlow — a warm, breathing light halo.
 * Wraps any content in a pulsing radial glow effect,
 * used for the savings tree lantern and milestone celebrations.
 */
export const LanternGlow: React.FC<LanternGlowProps> = ({
  color = ember[300],
  radius = 80,
  animate = true,
  style,
  children,
}) => {
  const opacity = useSharedValue(0.5);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (animate) {
      opacity.value = withRepeat(
        withSequence(
          withTiming(0.9, { duration: 2000, easing: Easing.inOut(Easing.sine) }),
          withTiming(0.4, { duration: 2000, easing: Easing.inOut(Easing.sine) }),
        ),
        -1,
        false,
      );
      scale.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 2000, easing: Easing.inOut(Easing.sine) }),
          withTiming(0.96, { duration: 2000, easing: Easing.inOut(Easing.sine) }),
        ),
        -1,
        false,
      );
    }
  }, [animate, opacity, scale]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={[styles.container, style]}>
      <Animated.View
        style={[
          styles.halo,
          {
            width: radius * 2,
            height: radius * 2,
            borderRadius: radius,
            backgroundColor: color,
          },
          glowStyle,
        ]}
      />
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    opacity: 0.25,
  },
});
