import { Image, StyleSheet, Text, View, type ImageStyle, type ViewStyle } from 'react-native';

import { colors } from '@/theme';


type AvatarProps = {
  uri?: string | null;
  label?: string | null;
  size?: number;
  ring?: boolean;
  style?: ViewStyle | ImageStyle;
};

export function Avatar({ uri, label, size = 40, ring = false, style }: AvatarProps) {
  const fallback = (label || '?').trim().slice(0, 1).toUpperCase() || '?';
  const frameStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
  } as const;

  if (uri) {
    return (
      <Image
        accessibilityLabel={label || undefined}
        source={{ uri }}
        style={[
          styles.base,
          frameStyle,
          ring && styles.ring,
          style as ImageStyle,
        ]}
      />
    );
  }

  return (
    <View
      accessibilityLabel={label || undefined}
      style={[
        styles.base,
        styles.fallback,
        frameStyle,
        ring && styles.ring,
        style as ViewStyle,
      ]}
    >
      <Text style={[styles.fallbackText, { fontSize: Math.max(12, size * 0.36) }]}>{fallback}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
  },
  ring: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    color: colors.primary,
    fontWeight: '800',
  },
});
