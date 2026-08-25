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
  const verified = marker.kind === 'artist';

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
      style={({ pressed }) => [
        styles.card,
        verified ? styles.cardVerified : styles.cardUnclaimed,
        pressed && onSelect && styles.pressed,
      ]}
    >
      <View style={styles.header}>
        {marker.avatar_url ? (
          <View style={styles.avatarRing}>
            <Image source={{ uri: marker.avatar_url }} style={styles.avatar} />
          </View>
        ) : (
          <View style={[styles.avatarFallback, !verified && styles.studioAvatar]}>
            <Text style={styles.avatarText}>
              {verified ? marker.name[0]?.toUpperCase() : '⌖'}
            </Text>
          </View>
        )}

        <View style={styles.identity}>
          <Text numberOfLines={1} style={styles.name}>{marker.name}</Text>
          {marker.tag ? <Text numberOfLines={1} style={styles.tag}>@{marker.tag}</Text> : null}
        </View>

        <View style={[styles.status, verified ? styles.statusVerified : styles.statusUnclaimed]}>
          <Text style={[styles.statusText, verified ? styles.statusTextVerified : styles.statusTextUnclaimed]}>
            {verified ? t('mapVerifiedArtist') : t('mapUnclaimedStudio')}
          </Text>
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

      <Text style={styles.kind}>{verified ? '✓ Tatzo' : '⌖ Tatzo Maps'}</Text>
      <Text numberOfLines={2} style={styles.address}>
        📍 {marker.address || [marker.city, marker.country].filter(Boolean).join(', ')}
      </Text>

      {marker.styles.length ? (
        <View style={styles.chips}>
          {marker.styles.slice(0, 5).map((style) => (
            <Text key={style} style={styles.styleChip}>{style}</Text>
          ))}
        </View>
      ) : null}

      <View style={styles.metrics}>
        <Text style={styles.metric}>Portfolio: <Text style={styles.metricStrong}>{marker.portfolio_count}</Text></Text>
        {marker.phone ? <Text numberOfLines={1} style={styles.metric}>{marker.phone}</Text> : null}
      </View>

      <View style={styles.actions}>
        {verified ? (
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
    borderWidth: 1,
    borderRadius: 22,
    padding: 12,
    gap: spacing.sm,
    backgroundColor: 'rgba(7, 19, 23, 0.96)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.26,
    shadowRadius: 22,
    elevation: 8,
  },
  cardVerified: { borderColor: 'rgba(4, 197, 191, 0.24)' },
  cardUnclaimed: { borderColor: 'rgba(238, 12, 111, 0.24)' },
  pressed: { opacity: 0.88, transform: [{ scale: 0.995 }] },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatarRing: {
    width: 50,
    height: 50,
    borderRadius: 25,
    padding: 2,
    borderWidth: 2,
    borderColor: 'rgba(238, 12, 111, 0.72)',
    backgroundColor: 'rgba(4, 197, 191, 0.16)',
  },
  avatar: { width: '100%', height: '100%', borderRadius: 23 },
  avatarFallback: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: 'rgba(238, 12, 111, 0.72)',
  },
  studioAvatar: { backgroundColor: colors.accent },
  avatarText: { color: colors.white, fontSize: 18, fontWeight: '900' },
  identity: { flex: 1, minWidth: 0 },
  name: { color: '#efffff', fontSize: 16, lineHeight: 20, fontWeight: '900' },
  tag: { color: '#9bc0c4', fontSize: 12, marginTop: 2 },
  status: {
    maxWidth: 112,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  statusVerified: { backgroundColor: 'rgba(4, 197, 191, 0.16)' },
  statusUnclaimed: { backgroundColor: 'rgba(238, 12, 111, 0.18)' },
  statusText: { fontSize: 8.5, lineHeight: 11, fontWeight: '900', textAlign: 'center' },
  statusTextVerified: { color: '#79fff9' },
  statusTextUnclaimed: { color: '#ff9fc8' },
  closeButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', marginLeft: -4 },
  closeText: { color: colors.textMuted, fontSize: 25, lineHeight: 27 },
  kind: { color: '#9bc0c4', fontSize: 11, fontWeight: '700' },
  address: { color: '#9bc0c4', fontSize: 12, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  styleChip: {
    color: '#9bc0c4',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 11,
  },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  metric: {
    color: '#9bc0c4',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 11,
  },
  metricStrong: { color: '#efffff', fontWeight: '900' },
  actions: { flexDirection: 'row', gap: 7, marginTop: 2 },
  action: { flex: 1, minHeight: 38, paddingHorizontal: spacing.sm, borderRadius: 13 },
});
