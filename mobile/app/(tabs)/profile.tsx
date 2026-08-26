import { router } from 'expo-router';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { BrandHeader } from '@/components/brand-header';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { t } from '@/i18n';
import { PUBLIC_LINKS } from '@/public-links';
import { colors, radius, shadow, spacing, typography } from '@/theme';


function artistStatusLabel(status: string) {
  if (status === 'rejected') return t('verificationStatusRejected');
  if (status === 'not_submitted') return t('verificationStatusNotSubmitted');
  return t('pendingVerification');
}

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  if (!user) return null;

  const accountLabel = user.is_verified_artist
    ? t('verified')
    : user.account_type === 'tattoo_artist'
      ? artistStatusLabel(user.verification_status)
      : t('regularAccount');

  return (
    <Screen contentStyle={styles.screen}>
      <BrandHeader showQuickMatch />

      <View style={styles.profileHero}>
        <View style={styles.identityRow}>
          {user.profile_image_url ? (
            <Image source={{ uri: user.profile_image_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarLetter}>{user.username[0]?.toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.identity}>
            <View style={styles.nameLine}>
              <Text numberOfLines={1} style={styles.username}>{user.username}</Text>
              {user.is_verified_artist ? <Text style={styles.verified}>✓</Text> : null}
            </View>
            <Text style={styles.tag}>@{user.tag ?? user.username}</Text>
            <View style={styles.badge}>
              <Text numberOfLines={1} style={styles.badgeText}>{accountLabel}</Text>
            </View>
          </View>
        </View>

        {user.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/edit-profile')}
          style={({ pressed }) => [styles.editAction, pressed && styles.pressed]}
        >
          <Text style={styles.editActionText}>{t('editProfile')}</Text>
          <Text style={styles.actionChevron}>›</Text>
        </Pressable>
      </View>

      {user.is_verified_artist ? (
        <View style={styles.workspaceCard}>
          <View style={styles.workspaceGlow} />
          <Text style={styles.artistEyebrow}>{t('artistDashboardEyebrow')}</Text>
          <Text style={styles.workspaceTitle}>{t('artistDashboard')}</Text>
          <Text style={styles.workspaceText}>{t('artistDashboardSubtitle')}</Text>
          <Button
            label={t('artistDashboard')}
            onPress={() => router.push('/artist-dashboard')}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/manage-portfolio')}
            style={({ pressed }) => [styles.workspaceSecondary, pressed && styles.pressed]}
          >
            <Text style={styles.workspaceSecondaryText}>{t('managePortfolio')}</Text>
            <Text style={styles.actionChevron}>›</Text>
          </Pressable>
        </View>
      ) : null}

      {user.account_type === 'tattoo_artist' && !user.is_verified_artist ? (
        <View style={styles.verificationCard}>
          <Text style={styles.verificationEyebrow}>{t('verificationEyebrow')}</Text>
          <Text style={styles.sectionTitle}>{t('verificationProfileTitle')}</Text>
          <Text style={styles.sectionText}>
            {user.verification_status === 'rejected'
              ? t('verificationProfileRejectedBody')
              : user.verification_status === 'not_submitted'
                ? t('verificationProfileStartBody')
                : t('verificationProfilePendingBody')}
          </Text>
          <Button
            label={t('verificationOpen')}
            onPress={() => router.push('/artist-verification')}
          />
        </View>
      ) : null}

      <View style={styles.infoCard}>
        <Text style={styles.groupEyebrow}>{t('account')}</Text>
        <Detail label={t('email')} value={user.email} />
        <Detail label={t('account')} value={user.account_type} />
        <Detail label="Timezone" value={user.timezone} last />
      </View>

      <SettingsGroup title={t('healing')}>
        <ActionRow
          label={t('healingOpen')}
          meta={t('healingProfileSubtitle')}
          onPress={() => router.push('/healing')}
          symbol="✦"
        />
        <ActionRow
          label={t('healthSafety')}
          meta={t('healthSafetyProfileSubtitle')}
          onPress={() => router.push('/health-safety')}
          symbol="＋"
          last
        />
      </SettingsGroup>

      <SettingsGroup title={t('legal')}>
        <ActionRow label={t('privacy')} onPress={() => void Linking.openURL(PUBLIC_LINKS.privacy)} symbol="⌁" />
        <ActionRow label={t('terms')} onPress={() => void Linking.openURL(PUBLIC_LINKS.terms)} symbol="⌁" />
        <ActionRow label={t('communityGuidelines')} onPress={() => void Linking.openURL(PUBLIC_LINKS.communityGuidelines)} symbol="⌁" last />
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

function Detail({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.detailRow, last && styles.rowLast]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.settingsGroup}>
      <Text style={styles.groupEyebrow}>{title}</Text>
      <View style={styles.settingsSurface}>{children}</View>
    </View>
  );
}

function ActionRow({
  label,
  meta,
  onPress,
  symbol,
  danger = false,
  last = false,
}: {
  label: string;
  meta?: string;
  onPress: () => void;
  symbol: string;
  danger?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionRow,
        last && styles.rowLast,
        pressed && styles.actionPressed,
      ]}
    >
      <View style={[styles.actionIcon, danger && styles.actionIconDanger]}>
        <Text style={[styles.actionIconText, danger && styles.dangerText]}>{symbol}</Text>
      </View>
      <View style={styles.actionCopy}>
        <Text style={[styles.actionLabel, danger && styles.dangerText]}>{label}</Text>
        {meta ? <Text numberOfLines={2} style={styles.actionMeta}>{meta}</Text> : null}
      </View>
      <Text style={[styles.actionChevron, danger && styles.dangerText]}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing.xxl },
  profileHero: {
    backgroundColor: 'rgba(0, 18, 28, 0.96)',
    borderColor: 'rgba(4, 197, 191, 0.18)',
    borderWidth: 1,
    borderRadius: radius.panel,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.panel,
  },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 76, height: 76, borderRadius: 38, borderWidth: 2, borderColor: colors.primary },
  avatarFallback: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.primarySoft,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: colors.primary, fontSize: 30, fontWeight: '900' },
  identity: { flex: 1, minWidth: 0, gap: 3 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  username: { flexShrink: 1, color: colors.text, fontSize: 25, lineHeight: 30, fontWeight: '900', letterSpacing: -0.4 },
  verified: { color: colors.primary, fontSize: 17, fontWeight: '900' },
  tag: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  badge: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    backgroundColor: colors.backgroundDeep,
    borderColor: 'rgba(4, 197, 191, 0.14)',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  badgeText: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
  bio: { color: colors.text, fontSize: 14, lineHeight: 21 },
  editAction: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(4, 197, 191, 0.12)',
    paddingTop: spacing.sm,
  },
  editActionText: { color: colors.primary, fontSize: 13, fontWeight: '900' },
  workspaceCard: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#06272d',
    borderColor: 'rgba(4, 197, 191, 0.36)',
    borderWidth: 1,
    borderRadius: radius.panel,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.panel,
  },
  workspaceGlow: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    right: -70,
    top: -75,
    backgroundColor: 'rgba(4, 197, 191, 0.10)',
  },
  artistEyebrow: { color: colors.primary, ...typography.eyebrow },
  workspaceTitle: { color: colors.text, fontSize: 25, lineHeight: 30, fontWeight: '900' },
  workspaceText: { color: colors.textMuted, lineHeight: 20, paddingBottom: spacing.xs },
  workspaceSecondary: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
  },
  workspaceSecondaryText: { color: colors.text, fontSize: 13, fontWeight: '800' },
  verificationCard: {
    backgroundColor: 'rgba(0, 18, 28, 0.96)',
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: 'rgba(238, 12, 111, 0.42)',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  verificationEyebrow: { color: colors.accent, ...typography.eyebrow },
  sectionTitle: { color: colors.text, fontSize: 21, fontWeight: '900' },
  sectionText: { color: colors.textMuted, lineHeight: 20 },
  infoCard: {
    backgroundColor: 'rgba(0, 18, 28, 0.72)',
    borderColor: 'rgba(4, 197, 191, 0.12)',
    borderWidth: 1,
    borderRadius: radius.large,
    overflow: 'hidden',
    paddingTop: spacing.sm,
  },
  groupEyebrow: {
    color: colors.textSubtle,
    ...typography.eyebrow,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  detailRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(4, 197, 191, 0.10)',
  },
  detailLabel: { color: colors.textMuted, fontSize: 12 },
  detailValue: { color: colors.text, fontSize: 12, fontWeight: '800', flexShrink: 1, textAlign: 'right' },
  settingsGroup: { gap: spacing.xs },
  settingsSurface: {
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 18, 28, 0.72)',
    borderColor: 'rgba(4, 197, 191, 0.12)',
    borderWidth: 1,
    borderRadius: radius.large,
  },
  actionRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(4, 197, 191, 0.10)',
  },
  rowLast: { borderBottomWidth: 0 },
  actionPressed: { backgroundColor: 'rgba(4, 197, 191, 0.05)' },
  actionIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
  },
  actionIconDanger: { backgroundColor: 'rgba(255, 87, 127, 0.10)' },
  actionIconText: { color: colors.primary, fontSize: 15, fontWeight: '900' },
  actionCopy: { flex: 1, minWidth: 0, gap: 2 },
  actionLabel: { color: colors.text, fontSize: 13, fontWeight: '800' },
  actionMeta: { color: colors.textMuted, fontSize: 10, lineHeight: 14 },
  actionChevron: { color: colors.textSubtle, fontSize: 23, lineHeight: 25 },
  dangerText: { color: colors.danger },
  signOut: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.14)',
    borderRadius: radius.medium,
    backgroundColor: 'rgba(0, 18, 28, 0.55)',
  },
  signOutText: { color: colors.textMuted, fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
});