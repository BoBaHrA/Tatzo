import { test } from 'node:test';
import assert from 'node:assert/strict';
import { knownPublicPostCount, withOwnerDetails } from '../src/map/owner-details.ts';

const marker = { kind: 'studio', name: 'MedusaTattoo', username: 'MedusaTattoo', status: 'claimed', claimable: false, can_book: false, portfolio_count: 0, styles: [], avatar_url: null, tag: null };
const profile = { username: 'MedusaTattoo', is_verified_artist: true, profile_image_url: 'https://example.test/avatar.png', portfolio_works_count: 4, tag: 'medusatattoo', posts_count: 3, recent_posts: [{ visibility: 'public' }, { visibility: 'followers' }, { visibility: 'private' }] };

test('managed studio uses owner avatar and portfolio without becoming a bookable artist', () => {
  const card = withOwnerDetails(marker, profile, ['Fine line', 'Blackwork']);
  assert.equal(card.avatar_url, profile.profile_image_url);
  assert.equal(card.portfolio_count, 4);
  assert.deepEqual(card.styles, ['Fine line', 'Blackwork']);
  assert.equal(card.kind, 'studio');
  assert.equal(card.can_book, false);
  assert.equal(card.claimable, false);
  assert.equal(card.public_post_count, 1);
  assert.equal(marker.avatar_url, null);
});

test('another account cannot enrich the studio even when a search result has a similar name', () => {
  assert.equal(withOwnerDetails(marker, { ...profile, username: 'MedusaTattoo2' }, ['Realism']), marker);
  assert.equal(withOwnerDetails({ ...marker, username: null }, profile, []).avatar_url, null);
});

test('private and followers-only posts are never included in the public map count', () => {
  assert.equal(knownPublicPostCount(profile), 1);
  assert.equal(knownPublicPostCount({ ...profile, posts_count: 0, recent_posts: [] }), 0);
});

test('a truncated recent-post sample is not presented as a total', () => {
  assert.equal(knownPublicPostCount({ ...profile, posts_count: 12 }), undefined);
  assert.equal(withOwnerDetails(marker, { ...profile, posts_count: 12 }, []).public_post_count, undefined);
});

test('owner verification and studio ownership are independent', () => {
  const card = withOwnerDetails(marker, { ...profile, is_verified_artist: false }, ['Fine line']);
  assert.equal(card.avatar_url, profile.profile_image_url);
  assert.equal(card.portfolio_count, 0);
  assert.deepEqual(card.styles, []);
  assert.equal(card.public_post_count, undefined);
});
