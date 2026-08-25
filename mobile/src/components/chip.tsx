import { Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

import { colors, layout, radius, spacing, typography } from '@/theme';


type ChipProps = PressableProps & {
  label: string;
  selected?: boolean;
  tone?: 'primary' | 'accent' | 'neutral';
};

export function Chip({ label, selected = false, tone = 'primary', style, ...props }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={(state) => [
        styles.base,
        selected && styles.selected,
        selected && tone === 'accent' && styles.selectedAccent,
        selected && tone === 'neutral' && styles.selectedNeutral,
        state.pressed && styles.pressed,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.label,
          selected && styles.selectedLabel,
          selected && tone === 'accent' && styles.selectedAccentLabel,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: layout.compactControlHeight,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  selected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  selectedAccent: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  selectedNeutral: {
    backgroundColor: colors.surfaceInteractive,
    borderColor: colors.borderStrong,
  },
  label: {
    color: colors.textMuted,
    ...typography.caption,
    fontWeight: '700',
  },
  selectedLabel: {
    color: colors.primary,
  },
  selectedAccentLabel: {
    color: colors.accent,
  },
  pressed: {
    opacity: 0.76,
    transform: [{ scale: 0.98 }],
  },
});
