import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
} from 'react-native';

import { colors, layout, radius, spacing } from '@/theme';


type ButtonProps = PressableProps & {
  label: string;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
};

export function Button({
  label,
  loading = false,
  variant = 'primary',
  disabled,
  style,
  ...props
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={(state) => [
        styles.base,
        styles[variant],
        (disabled || loading) && styles.disabled,
        state.pressed && styles.pressed,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.backgroundDeep : colors.text} />
      ) : (
        <Text style={[styles.label, variant === 'primary' && styles.primaryLabel]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: layout.controlHeight,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
  },
  primary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
  },
  danger: {
    backgroundColor: 'transparent',
    borderColor: colors.danger,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  primaryLabel: {
    color: colors.backgroundDeep,
  },
  disabled: {
    opacity: 0.46,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.88,
  },
});
