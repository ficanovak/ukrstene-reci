/**
 * Minimal themed button used across the skeleton screens (Task 4.5).
 *
 * Reads `useTheme().colors` so it respects light/dark automatically. Two
 * variants: `primary` (filled teal) and `secondary` (outlined). Intentionally
 * small — gameplay-grade controls come in later phases.
 */
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';
import { typography } from '@/theme';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  style,
}: ButtonProps) {
  const { colors } = useTheme();
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: isPrimary ? colors.primary : 'transparent',
          borderColor: colors.primary,
          opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: isPrimary ? colors.background : colors.primary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...typography.label,
  },
});
