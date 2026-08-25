import { Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

import { colors, layout, radius } from '@/theme';


type IconButtonProps = PressableProps & {
  symbol: string;
  tone?: 'primary' | 'accent' | 'muted';
  filled?: boolean;
};

export function IconButton({ symbol, tone = 'primary', filled = false, style, ...props }: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      style={(state) => [
        styles.base,
        filled && styles.filled,
        tone === 'accent' && styles.accent,
        tone === 'muted' && styles.muted,
        state.pressed && styles.pressed,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}
    >
      <Text
        style={[
          styles.symbol,
          tone === 'accent' && styles.accentSymbol,
          tone === 'muted' && styles.mutedSymbol,
        ]}
      >
        {symbol}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  filled: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
  },
  accent: {
    borderColor: colors.accentSoft,
  },
  muted: {
    borderColor: colors.border,
  },
  symbol: {
    color: colors.primary,
    fontSize: 23,
    lineHeight: 26,
    fontWeight: '700',
  },
  accentSymbol: {
    color: colors.accent,
  },
  mutedSymbol: {
    color: colors.textMuted,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.96 }],
  },
});
