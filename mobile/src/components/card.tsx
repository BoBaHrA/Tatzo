import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { colors, layout, radius, shadow } from '@/theme';


type CardProps = PropsWithChildren<ViewProps> & {
  elevated?: boolean;
};

export function Card({ children, elevated = false, style, ...props }: CardProps) {
  return (
    <View style={[styles.card, elevated && styles.elevated, style]} {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.large,
    padding: layout.cardPadding,
  },
  elevated: {
    backgroundColor: colors.surfaceRaised,
    ...shadow.panel,
  },
});
