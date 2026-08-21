import { router } from 'expo-router';
import { Image, Linking, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { BrandHeader } from '@/components/brand-header';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { t } from '@/i18n';
import { PUBLIC_LINKS } from '@/public-links';
import { colors, radius, spacing } from '@/theme';


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
    <Screen>
      <BrandHeader />
      <View style={styles.profileCard}>
        {user.profile_image_url ? (
          <Image source={{ uri: user.profile_image_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarLetter}>{user.username[0]?.toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.identity}>
          <Text style={styles.username}>{user.username}</Text>
          <Text style={styles.tag}>@{user.tag ?? user.username}</Text>
          <View style={styles.badge}><Text style={styles.badgeText}>{accountLabel}</Text></View>
        </View>
      </View>
      {user.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}
      <View style={styles.details}>
        <Detail label={t('email')} value={user.email} />
        <Detail label={t('account')} value={user.account_type} />
        <Detail label="Timezone" value={user.timezone} />
      </View>
      {user.is_verified_artist ? (
        <View style={styles.artistCard}>
          <Text style={styles.artistEyebrow}>{t('artistDashboardEyebrow')}</Text>
          <Text style={styles.artistTitle}>{t('artistDashboard')}</Text>
          <Text style={styles.artistText}>{t('artistDashboardSubtitle')}</Text>
          <Button
            label={t('artistDashboard')}
            onPress={() => router.push('/artist-dashboard')}
          />
          <Button
            label={t('managePortfolio')}
            onPress={() => router.push('/manage-portfolio')}
            variant="secondary"
          />
        </View>
      ) : null}
      {user.account_type === 'tattoo_artist' && !user.is_verified_artist ? (
        <View style={styles.verificationCard}>
          <Text style={styles.artistEyebrow}>{t('verificationEyebrow')}</Text>
          <Text style={styles.artistTitle}>{t('verificationProfileTitle')}</Text>
          <Text style={styles.artistText}>
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
      <Button label={t('editProfile')} onPress={() => router.push('/edit-profile')} />
      <View style={styles.safetyCard}>
        <Text style={styles.safetyTitle}>{t('healthSafety')}</Text>
        <Text style={styles.safetyText}>{t('healthSafetyProfileSubtitle')}</Text>
        <Button
          label={t('healthSafety')}
          onPress={() => router.push('/health-safety')}
          variant="secondary"
        />
      </View>
      <View style={styles.safetyCard}>
        <Text style={styles.safetyTitle}>{t('legal')}</Text>
        <Text style={styles.safetyText}>{t('legalSubtitle')}</Text>
        <Button
          label={t('privacy')}
          onPress={() => void Linking.openURL(PUBLIC_LINKS.privacy)}
          variant="secondary"
        />
        <Button
          label={t('terms')}
          onPress={() => void Linking.openURL(PUBLIC_LINKS.terms)}
          variant="secondary"
        />
        <Button
          label={t('communityGuidelines')}
          onPress={() => void Linking.openURL(PUBLIC_LINKS.communityGuidelines)}
          variant="secondary"
        />
      </View>
      <View style={styles.safetyCard}>
        <Text style={styles.safetyTitle}>{t('safety')}</Text>
        <Text style={styles.safetyText}>{t('safetySubtitle')}</Text>
        <Button
          label={t('blockedUsers')}
          onPress={() => router.push('/blocked-users')}
          variant="secondary"
        />
        <Button
          label={t('contactSafetySupport')}
          onPress={() => void Linking.openURL(PUBLIC_LINKS.safetySupport)}
          variant="secondary"
        />
        <Button
          label={t('deleteAccount')}
          onPress={() => router.push('/delete-account')}
          variant="danger"
        />
      </View>
      <Button label={t('signOut')} variant="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  avatar: { width: 84, height: 84, borderRadius: 42 },
  avatarFallback: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: colors.backgroundDeep, fontSize: 34, fontWeight: '900' },
  identity: { flex: 1, gap: 3 },
  username: { color: colors.text, fontSize: 24, fontWeight: '900' },
  tag: { color: colors.primary, fontWeight: '700' },
  badge: { alignSelf: 'flex-start', backgroundColor: colors.backgroundDeep, borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 10, marginTop: spacing.xs },
  badgeText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  bio: { color: colors.text, lineHeight: 22, paddingHorizontal: spacing.xs },
  details: { backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  artistCard: { backgroundColor: colors.surface, borderRadius: radius.large, borderWidth: 1, borderColor: colors.primaryMuted, padding: spacing.lg, gap: spacing.sm },
  verificationCard: { backgroundColor: colors.surface, borderRadius: radius.large, borderWidth: 1, borderColor: colors.accent, padding: spacing.lg, gap: spacing.sm },
  artistEyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  artistTitle: { color: colors.text, fontSize: 22, fontWeight: '900' },
  artistText: { color: colors.textMuted, lineHeight: 20 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, padding: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  detailLabel: { color: colors.textMuted },
  detailValue: { color: colors.text, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  safetyCard: { backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  safetyTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
  safetyText: { color: colors.textMuted, lineHeight: 21 },
});
