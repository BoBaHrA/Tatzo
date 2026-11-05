import type { MapLocationMarker, PublicProfile } from '@/api/types';

/** Only count public posts when the API returned the complete visible set. */
export function knownPublicPostCount(profile: PublicProfile): number | undefined {
  if (profile.posts_count !== profile.recent_posts.length) return undefined;
  return profile.recent_posts.filter(post => post.visibility === 'public').length;
}

export function withOwnerDetails(marker: MapLocationMarker, profile: PublicProfile, styles: string[], styleKeys = styles): MapLocationMarker {
  if (!marker.username || marker.username.toLowerCase() !== profile.username.toLowerCase()) return marker;
  return {
    ...marker,
    avatar_url: profile.profile_image_url || marker.avatar_url,
    tag: profile.tag || marker.tag,
    portfolio_count: profile.is_verified_artist ? profile.portfolio_works_count : marker.portfolio_count,
    styles: profile.is_verified_artist && styles.length ? styles.slice(0, 4) : marker.styles,
    style_keys: profile.is_verified_artist && styleKeys.length ? styleKeys.slice(0, 4) : marker.style_keys ?? marker.styles,
    public_post_count: profile.is_verified_artist ? knownPublicPostCount(profile) : undefined,
  };
}

export function matchesMapStyle(marker: MapLocationMarker, style: string) {
  const normalize = (value: string) => value.toLowerCase().replace(/[_\s-]+/g, ' ').trim();
  return [...marker.styles, ...(marker.style_keys ?? [])].some(value => normalize(value) === normalize(style));
}
