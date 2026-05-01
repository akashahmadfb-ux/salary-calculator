import { BlurView } from 'expo-blur';
import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { borderRadius, shadow, spacing } from '../tokens/spacing';
import { glass, night } from '../tokens/colors';

export interface GlassCardProps {
  children: React.ReactNode;
  /** Blur intensity 0–100 (default 20) */
  intensity?: number;
  /** Additional style overrides */
  style?: ViewStyle;
  /** Whether to show a glowing border */
  glowBorder?: boolean;
  /** Padding variant */
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingMap = {
  none: 0,
  sm: spacing[3],
  md: spacing[5],
  lg: spacing[8],
} as const;

/**
 * GlassCard — frosted-glass card component.
 * Uses expo-blur for real BlurView on iOS/Android and falls back
 * to a semi-transparent overlay on web.
 */
export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  intensity = 20,
  style,
  glowBorder = false,
  padding = 'md',
}) => {
  return (
    <View
      style={[
        styles.wrapper,
        glowBorder && styles.glowBorder,
        { padding: paddingMap[padding] },
        shadow.glass,
        style,
      ]}
    >
      <BlurView
        intensity={intensity}
        tint="dark"
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.overlay} />
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: borderRadius['2xl'],
    overflow: 'hidden',
    backgroundColor: night[800],
    borderWidth: 1,
    borderColor: glass.border,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: glass.white10,
  },
  glowBorder: {
    borderColor: 'rgba(61, 111, 255, 0.35)',
    borderWidth: 1.5,
  },
});
