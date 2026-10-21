import type { MapLocationMarker, PublicProfile } from '@/api/types';

/** Only count public posts when the API returned the complete visible set. */
export function knownPublicPostCount(profile: PublicProfile): number | undefined {
  if (profile.posts_count !== profile.recent_posts.length) return undefined;
  return profile.recent_posts.filter(post => post.visibility === 'public').length;
}

export function withOwnerDetails(marker: MapLocationMarker, profile: PublicProfile, styles: string[]): MapLocationMarker {
  if (!marker.username || marker.username.toLowerCase() !== profile.username.toLowerCase()) return marker;
  return {
    ...marker,
    avatar_url: profile.profile_image_url || marker.avatar_url,
    tag: profile.tag || marker.tag,
    portfolio_count: profile.is_verified_artist ? profile.portfolio_works_count : marker.portfolio_count,
    styles: profile.is_verified_artist ? styles.slice(0, 4) : marker.styles,
    public_post_count: profile.is_verified_artist ? knownPublicPostCount(profile) : undefined,
  };
}
