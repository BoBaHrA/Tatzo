import { router } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { BrandHeader } from '@/components/brand-header';
import { Screen } from '@/components/screen';
import { t } from '@/i18n';
import { PUBLIC_LINKS } from '@/public-links';
import { colors, radius, spacing, typography } from '@/theme';


export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  if (!user) return null;

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.topRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View style={styles.headerWrap}><BrandHeader showQuickMatch /></View>
      </View>

      <View style={styles.intro}>
        <Text style={styles.eyebrow}>{t('account')}</Text>
        <Text style={styles.title}>{t('profile')}</Text>
        <Text style={styles.subtitle}>{user.email}</Text>
      </View>

      <SettingsGroup title={t('account')}>
        <ActionRow label={t('editProfile')} onPress={() => router.push('/edit-profile')} symbol="✎" />
        {user.is_verified_artist ? (
          <ActionRow label={t('artistDashboard')} onPress={() => router.push('/artist-dashboard')} symbol="✦" />
        ) : null}
        {user.is_verified_artist ? (
          <ActionRow label={t('managePortfolio')} onPress={() => router.push('/manage-portfolio')} symbol="▦" last />
        ) : (
          <ActionRow label={t('verificationOpen')} onPress={() => router.push('/artist-verification')} symbol="✓" last={user.account_type === 'tattoo_artist'} />
        )}
      </SettingsGroup>

      <SettingsGroup title={t('healing')}>
        <ActionRow label={t('healingOpen')} onPress={() => router.push('/healing')} symbol="✦" />
        <ActionRow label={t('healthSafety')} onPress={() => router.push('/health-safety')} symbol="＋" last />
      </SettingsGroup>

      <SettingsGroup title={t('legal')}>
        <ActionRow label={t('privacy')} onPress={() => void Linking.openURL(PUBLIC_LINKS.privacy)} symbol="↗" />
        <ActionRow label={t('terms')} onPress={() => void Linking.openURL(PUBLIC_LINKS.terms)} symbol="↗" />
        <ActionRow label={t('communityGuidelines')} onPress={() => void Linking.openURL(PUBLIC_LINKS.communityGuidelines)} symbol="↗" last />
      </SettingsGroup>

      <SettingsGroup title={t('safety')}>
        <ActionRow label={t('blockedUsers')} onPress={() => router.push('/blocked-users')} symbol="⊘" />
        <ActionRow label={t('contactSafetySupport')} onPress={() => void Linking.openURL(PUBLIC_LINKS.safetySupport)} symbol="?" />
        <ActionRow label={t('deleteAccount')} onPress={() => router.push('/delete-account')} symbol="×" danger last />
      </SettingsGroup>

      <Pressable
        accessibilityRole="button"
        onPress={() => void signOut()}
        style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
      >
        <Text style={styles.signOutText}>{t('signOut')}</Text>
      </Pressable>
    </Screen>
  );
}

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.surface}>{children}</View>
    </View>
  );
}

function ActionRow({
  label,
  onPress,
  symbol,
  danger = false,
  last = false,
}: {
  label: string;
  onPress: () => void;
  symbol: string;
  danger?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, last && styles.last, pressed && styles.rowPressed]}
    >
      <View style={[styles.symbol, danger && styles.symbolDanger]}>
        <Text style={[styles.symbolText, danger && styles.danger]}>{symbol}</Text>
      </View>
      <Text style={[styles.rowLabel, danger && styles.danger]}>{label}</Text>
      <Text style={[styles.chevron, danger && styles.danger]}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing.xxl },
  topRow: { flexDirection: 'row', alignItems: 'center', minHeight: 52 },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.primary, fontSize: 34, lineHeight: 35 },
  headerWrap: { flex: 1, marginRight: 42 },
  intro: {
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(4, 197, 191, 0.12)',
    paddingBottom: spacing.md,
  },
  eyebrow: { color: colors.primary, ...typography.eyebrow },
  title: { color: colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: colors.textMuted, fontSize: 13 },
  group: { gap: spacing.xs },
  groupTitle: { color: colors.textSubtle, ...typography.eyebrow, paddingHorizontal: spacing.xs },
  surface: {
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.14)',
    borderRadius: radius.large,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 18, 28, 0.76)',
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(4, 197, 191, 0.10)',
  },
  last: { borderBottomWidth: 0 },
  rowPressed: { backgroundColor: 'rgba(4, 197, 191, 0.06)' },
  symbol: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: 'rgba(4, 197, 191, 0.10)',
  },
  symbolDanger: { backgroundColor: 'rgba(238, 12, 111, 0.10)' },
  symbolText: { color: colors.primary, fontSize: 15, fontWeight: '900' },
  rowLabel: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '800' },
  chevron: { color: colors.textSubtle, fontSize: 24 },
  danger: { color: colors.danger },
  signOut: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.14)',
    borderRadius: radius.medium,
  },
  signOutText: { color: colors.textMuted, fontWeight: '800' },
  pressed: { opacity: 0.68 },
});
