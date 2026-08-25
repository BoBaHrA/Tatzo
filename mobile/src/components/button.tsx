import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
} from 'react-native';

import { colors, layout, radius, spacing, typography } from '@/theme';


type ButtonProps = PressableProps & {
  label: string;
  loading?: boolean;
  variant?: 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
  size?: 'compact' | 'default';
};

export function Button({
  label,
  loading = false,
  variant = 'primary',
  size = 'default',
  disabled,
  style,
  ...props
}: ButtonProps) {
  const isDisabled = Boolean(disabled || loading);
  const darkLabel = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={(state) => [
        styles.base,
        size === 'compact' ? styles.compact : styles.defaultSize,
        styles[variant],
        isDisabled && styles.disabled,
        state.pressed && !isDisabled && styles.pressed,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={darkLabel ? colors.backgroundDeep : colors.text} />
      ) : (
        <Text
          numberOfLines={1}
          style={[
            styles.label,
            darkLabel && styles.primaryLabel,
            variant === 'danger' && styles.dangerLabel,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
  },
  defaultSize: {
    minHeight: layout.controlHeight,
  },
  compact: {
    minHeight: layout.compactControlHeight,
    paddingHorizontal: spacing.md,
  },
  primary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  accent: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  secondary: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  danger: {
    backgroundColor: 'transparent',
    borderColor: colors.danger,
  },
  label: {
    color: colors.text,
    ...typography.bodyStrong,
  },
  primaryLabel: {
    color: colors.backgroundDeep,
  },
  dangerLabel: {
    color: colors.danger,
  },
  disabled: {
    opacity: 0.42,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.84,
  },
});
