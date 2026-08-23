import { router } from 'expo-router';
import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { MapLocationMarker } from '@/api/types';
import { Button } from '@/components/button';
import { t } from '@/i18n';
import { colors, radius, spacing } from '@/theme';


type MapLocationCardProps = {
  marker: MapLocationMarker;
  onClose?: () => void;
  onSelect?: () => void;
};

export function MapLocationCard({ marker, onClose, onSelect }: MapLocationCardProps) {
  const claimPending = marker.claim_status === 'submitted'
    || marker.claim_status === 'under_review';

  const openProfile = () => {
    if (!marker.username) return;
    router.push({
      pathname: '/profile/[username]',
      params: { username: marker.username },
    });
  };

  const openBooking = () => {
    if (!marker.username) return;
    router.push({
      pathname: '/booking/[username]',
      params: { username: marker.username },
    });
  };

  const openClaim = () => {
    router.push({
      pathname: '/map/claim/[locationId]',
      params: {
        locationId: String(marker.location_id),
        name: marker.name,
      },
    });
  };

  return (
    <Pressable
      accessibilityRole={onSelect ? 'button' : undefined}
      onPress={onSelect}
      style={({ pressed }) => [styles.card, pressed && onSelect && styles.pressed]}
    >
      <View style={styles.header}>
        {marker.avatar_url ? (
          <Image source={{ uri: marker.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarFallback, marker.kind === 'studio' && styles.studioAvatar]}>
            <Text style={styles.avatarText}>
              {marker.kind === 'artist' ? marker.name[0]?.toUpperCase() : 'S'}
            </Text>
          </View>
        )}
        <View style={styles.identity}>
          <View style={styles.kindRow}>
            <Text style={[styles.kind, marker.kind === 'studio' && styles.studioKind]}>
              {marker.kind === 'artist' ? t('mapVerifiedArtist') : t('mapUnclaimedStudio')}
            </Text>
            {marker.kind === 'artist' ? <Text style={styles.verified}>✓</Text> : null}
          </View>
          <Text numberOfLines={1} style={styles.name}>{marker.name}</Text>
          {marker.tag ? <Text style={styles.tag}>@{marker.tag}</Text> : null}
        </View>
        {onClose ? (
          <Pressable
            accessibilityLabel={t('close')}
            accessibilityRole="button"
            onPress={onClose}
            style={styles.closeButton}
          >
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        ) : null}
      </View>

      <Text numberOfLines={2} style={styles.address}>
        {marker.address || [marker.city, marker.country].filter(Boolean).join(', ')}
      </Text>

      {marker.styles.length ? (
        <View style={styles.chips}>
          {marker.styles.slice(0, 4).map((style) => (
            <Text key={style} style={styles.styleChip}>{style}</Text>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        {marker.kind === 'artist' ? (
          <>
            <Button
              label={t('openProfile')}
              onPress={openProfile}
              style={styles.action}
              variant="secondary"
            />
            {marker.can_book ? (
              <Button
                label={t('bookNow')}
                onPress={openBooking}
                style={styles.action}
              />
            ) : null}
          </>
        ) : (
          <>
            {marker.website ? (
              <Button
                label={t('mapWebsite')}
                onPress={() => void Linking.openURL(marker.website!)}
                style={styles.action}
                variant="secondary"
              />
            ) : null}
            <Button
              disabled={claimPending || !marker.claimable}
              label={claimPending ? t('mapClaimPending') : t('mapClaim')}
              onPress={openClaim}
              style={styles.action}
            />
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.md,
    gap: spacing.sm,
  },
  pressed: { opacity: 0.86, transform: [{ scale: 0.995 }] },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarFallback: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryMuted,
  },
  studioAvatar: { backgroundColor: colors.accent },
  avatarText: { color: colors.text, fontSize: 18, fontWeight: '900' },
  identity: { flex: 1, minWidth: 0 },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  kind: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  studioKind: { color: colors.accent },
  verified: { color: colors.primary, fontWeight: '900' },
  name: { color: colors.text, fontSize: 18, fontWeight: '900' },
  tag: { color: colors.textMuted, fontSize: 12 },
  closeButton: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.textMuted, fontSize: 28, lineHeight: 30 },
  address: { color: colors.textMuted, lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  styleChip: {
    color: colors.primary,
    backgroundColor: colors.backgroundDeep,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: '700',
  },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1, minHeight: 44, paddingHorizontal: spacing.sm },
});
