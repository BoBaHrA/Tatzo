import { useLanguage } from '@/localization/language-context';
import { useState } from 'react';
import { router } from 'expo-router';
import { Alert, Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import type { MapLocationMarker } from '@/api/types';
import { Button } from '@/components/button';
import { t } from '@/i18n';
import { mapLocationPresentation } from '@/map/location-presentation';
import { colors, radius, spacing } from '@/theme';
import { API_BASE_URL } from '@/api/client';
import { profileCopy as copy } from '@/profile/profile-copy';


type MapLocationCardProps = {
  marker: MapLocationMarker;
  onClose?: () => void;
  onSelect?: () => void;
};

export function MapLocationCard({ marker, onClose, onSelect }: MapLocationCardProps) {
  useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const presentation = mapLocationPresentation(marker);
  const { artist, connected, claimPending } = presentation;
  const openWebsite = async (url: string) => {
    try {
      const parsed = new URL(url);
      if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Unsupported website URL');
      await Linking.openURL(parsed.toString());
    } catch { Alert.alert(t('mapWebsite'), t('mapLoadError')); }
  };
  const reportOutdated = () => {
    setMenuOpen(false);
    void openWebsite(`${new URL(API_BASE_URL).origin}/maps/location/${marker.location_id}/report-outdated/`);
  };

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
    if (!presentation.canClaim) return;
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
        connected ? styles.cardVerified : styles.cardUnclaimed,
        pressed && onSelect && styles.pressed,
      ]}
    >
      <View style={styles.header}>
        {marker.avatar_url ? (
          <View style={[styles.avatarRing, connected && styles.managedAvatar]}>
            <Image source={{ uri: marker.avatar_url }} style={styles.avatar} />
          </View>
        ) : (
          <View style={[styles.avatarFallback, connected ? styles.managedAvatar : styles.studioAvatar]}>
            <Text style={styles.avatarText}>
              {artist ? marker.name[0]?.toUpperCase() : '⌖'}
            </Text>
          </View>
        )}

        <View style={styles.identity}>
          <Text numberOfLines={2} style={styles.name}>{marker.name}</Text>
          <Text numberOfLines={1} style={styles.tag}>{artist ? `@${marker.tag || marker.username || marker.name}` : connected ? copy('Managed studio', 'Studio géré', 'Управляемая студия') : copy('Imported location', 'Lieu importé', 'Импортированный адрес')}</Text>
        </View>
        <Pressable accessibilityLabel={copy('More options', 'Plus d’options', 'Другие действия')} accessibilityRole="button" accessibilityState={{ expanded: menuOpen }} onPress={(event) => { event.stopPropagation(); setMenuOpen(value => !value); }} style={styles.moreButton}><Text style={styles.moreText}>⋯</Text></Pressable>

        {onClose ? (
          <Pressable
            accessibilityLabel={t('close')}
            accessibilityRole="button"
            onPress={(event) => { event.stopPropagation(); onClose(); }}
            style={styles.closeButton}
          >
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        ) : null}
      </View>
      {menuOpen ? <Pressable accessibilityRole="button" onPress={(event) => { event.stopPropagation(); reportOutdated(); }} style={styles.reportMenu}><Text style={styles.reportText}>{copy('Report closed or outdated location', 'Signaler un lieu fermé ou obsolète', 'Сообщить о закрытом или устаревшем адресе')}</Text></Pressable> : null}
      <View style={styles.kindRow}>
        <Text style={styles.kind}>{artist ? copy('Registered Tatzo artist', 'Artiste inscrit sur Tatzo', 'Мастер Tatzo') : connected ? copy('Managed Tatzo studio', 'Studio Tatzo géré', 'Управляемая студия Tatzo') : copy('Not yet on Tatzo / Unclaimed', 'Pas encore sur Tatzo / Non revendiqué', 'Ещё не на Tatzo / Не присвоено')}</Text>
        <View style={[styles.status, connected ? styles.statusVerified : styles.statusUnclaimed]}><Text style={[styles.statusText, connected ? styles.statusTextVerified : styles.statusTextUnclaimed]}>{connected ? copy('Verified', 'Vérifié', 'Подтверждено') : copy('Needs claim', 'À revendiquer', 'Не присвоено')}</Text></View>
      </View>
      <Text numberOfLines={2} style={styles.address}>
        📍 {marker.address || [marker.city, marker.country].filter(Boolean).join(', ')}
      </Text>

      {marker.styles.length ? (
        <View style={styles.chips}>
          {marker.styles.slice(0, 4).map((style) => (
            <Text key={style} style={styles.styleChip}>{style}</Text>
          ))}
        </View>
      ) : null}

      {marker.phone ? <Text style={styles.address}>{marker.phone}</Text> : null}
      <View style={styles.metrics}>
        <Text style={styles.metric}>Portfolio: <Text style={styles.metricStrong}>{marker.portfolio_count}</Text></Text>
        {marker.public_post_count !== undefined ? <Text style={styles.metric}>{copy('Posts', 'Publications', 'Публикации')}: <Text style={styles.metricStrong}>{marker.public_post_count}</Text></Text> : null}
        {!artist ? <Text style={styles.metric}>{copy('Data', 'Données', 'Данные')}: <Text style={styles.metricStrong}>80%</Text></Text> : null}
      </View>

      <View style={styles.actions}>
        {presentation.canOpenProfile ? (
          <Button
            label={t('profile')}
            onPress={openProfile}
            style={styles.action}
            variant="secondary"
          />
        ) : null}
        {presentation.canBook ? (
          <Button label={t('bookNow')} onPress={openBooking} style={styles.action} />
        ) : null}
        {!artist && marker.website ? (
          <Button
            label={t('mapWebsite')}
            onPress={() => void openWebsite(marker.website!)}
            style={styles.action}
            variant="secondary"
          />
        ) : null}
        {presentation.showClaim ? (
          <Button
            disabled={!presentation.canClaim}
            label={claimPending ? t('mapClaimPending') : t('mapClaim')}
            onPress={openClaim}
            style={styles.action}
          />
        ) : null}
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
  cardVerified: { borderColor: 'rgba(4, 197, 191, 0.3)' },
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
  managedAvatar: { borderColor: 'rgba(4,197,191,.85)', backgroundColor: '#071e26' },
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
  statusText: { fontSize: 10, lineHeight: 12, fontWeight: '900', textAlign: 'center' },
  statusTextVerified: { color: '#79fff9' },
  statusTextUnclaimed: { color: '#ff9fc8' },
  closeButton: { width: 24, height: 38, alignItems: 'center', justifyContent: 'center', marginLeft: -4 },
  closeText: { color: colors.textMuted, fontSize: 25, lineHeight: 27 },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  kind: { flex: 1, color: '#9bc0c4', fontSize: 12, lineHeight: 17 },
  moreButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 12, borderColor: 'rgba(4,197,191,.2)', backgroundColor: '#061a25' },
  moreText: { color: '#c9f8f8', fontSize: 23 },
  reportMenu: { alignSelf: 'flex-end', maxWidth: 280, padding: 12, borderWidth: 1, borderRadius: 14, borderColor: 'rgba(4,197,191,.22)', backgroundColor: '#061b26' },
  reportText: { color: '#e8f8fa', fontSize: 12, fontWeight: '700', lineHeight: 17 },
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
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 2 },
  action: { flexGrow: 1, flexBasis: 118, minHeight: 38, paddingHorizontal: spacing.sm, borderRadius: 13 },
});

