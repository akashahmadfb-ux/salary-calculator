import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { leaf, night } from '../tokens/colors';

export interface TreeNodeProps {
  /** Savings progress 0–1 */
  progress: number;
  /** Branch angle in degrees from vertical */
  angle?: number;
  /** Branch length in dp */
  length?: number;
  /** Branch thickness in dp */
  thickness?: number;
  /** Colour (defaults to leaf green) */
  color?: string;
  style?: ViewStyle;
}

/**
 * TreeNode — a single animated branch segment of the savings tree.
 * Stack multiple TreeNodes with different angles and lengths to build
 * the full tree. Branch grows from 0% to 100% via `progress`.
 */
export const TreeNode: React.FC<TreeNodeProps> = ({
  progress,
  angle = 0,
  length = 60,
  thickness = 6,
  color = leaf[400],
  style,
}) => {
  const growProgress = useSharedValue(0);

  React.useEffect(() => {
    growProgress.value = withTiming(progress, {
      duration: 1200,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, growProgress]);

  const branchStyle = useAnimatedStyle(() => ({
    height: growProgress.value * length,
    opacity: growProgress.value > 0.05 ? 1 : 0,
  }));

  return (
    <View
      style={[
        styles.container,
        { transform: [{ rotate: `${angle}deg` }] },
        style,
      ]}
    >
      <Animated.View
        style={[
          styles.branch,
          {
            width: thickness,
            backgroundColor: color,
            borderRadius: thickness / 2,
          },
          branchStyle,
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  branch: {
    transformOrigin: 'bottom center',
  },
});
