import type { PropsWithChildren } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { AuthLanguageSwitcher } from '@/auth/auth-language-switcher';
import { Screen } from '@/components/screen';
import { colors, radius, spacing } from '@/theme';


type AuthShellProps = PropsWithChildren<{
  centered?: boolean;
}>;

export function AuthShell({ children, centered = false }: AuthShellProps) {
  return (
    <Screen contentStyle={centered ? styles.centeredScreen : styles.screen}>
      <View style={styles.frame}>
        <AuthLanguageSwitcher />
        <Image
          accessibilityLabel="Tatzo"
          source={require('../../assets/tatzo7.png')}
          resizeMode="contain"
          style={styles.logo}
        />
        <View style={styles.card}>{children}</View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: spacing.sm,
  },
  centeredScreen: {
    paddingTop: spacing.sm,
    justifyContent: 'center',
  },
  frame: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    gap: spacing.md,
  },
  logo: {
    width: 205,
    height: 64,
    alignSelf: 'center',
    marginVertical: spacing.xs,
  },
  card: {
    width: '100%',
    padding: spacing.xl,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.large,
    backgroundColor: colors.backgroundDeep,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 3,
  },
});
