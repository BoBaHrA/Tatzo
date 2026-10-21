// CI-only entry point. Render the shipped components without signing into an account.
// This runs in a separate job and never changes the installable Android application.
import { readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
pkg.main = 'profile-review-entry.tsx';
writeFileSync('package.json', JSON.stringify(pkg, null, 2));
writeFileSync('profile-review-entry.tsx', `
import { useEffect } from 'react';
import { registerRootComponent } from 'expo';
import { Pressable, ScrollView, View } from 'react-native';
import { FontProvider, Text } from './src/components/text';
import { LanguageProvider, useLanguage } from './src/localization/language-context';
import { ProfileHeader, profileActionStyles } from './src/profile/profile-header';
import { ProfileTabs, ProfilePostGrid } from './src/profile/profile-content';
import { MapLocationCard } from './src/map/location-card';

const profile = { id: 1, username: 'MedusaTattoo', tag: 'medusatattoo', bio: 'Clermont-Ferrand based tattoo artist', account_type: 'tattoo_artist', is_verified_artist: true, profile_image_url: null, followers_count: 3, following_count: 0, posts_count: 2, portfolio_works_count: 4, is_following: false, is_self: false, portfolio: [], recent_posts: [] };
const marker = { marker_id: 'review:1', location_id: 1, kind: 'studio', name: 'MedusaTattoo', tag: 'medusatattoo', username: 'MedusaTattoo', avatar_url: null, address: '5 rue Victor Duruy', city: 'Clermont-Ferrand', country: 'France', latitude: 45.78, longitude: 3.08, status: 'claimed', styles: ['Fine line', 'Blackwork', 'Realism', 'Minimalism'], style_keys: ['fine_line','blackwork','realism','minimalism'], booking_modes: [], can_book: false, portfolio_count: 4, public_post_count: 2, website: null, phone: '0767454704', claimable: false, claim_status: null };
function Preview() {
  const { setLanguage } = useLanguage();
  const query = new URLSearchParams(window.location.search);
  const own = query.get('own') === '1';
  const long = query.get('long') === '1';
  const map = query.get('map') === '1';
  useEffect(() => { void setLanguage(query.get('lang') === 'ru' ? 'ru' : 'fr'); }, []);
  const p = { ...profile, is_self: own, username: long ? 'MedusaTattooClermontFerrandStudio' : profile.username };
  return <ScrollView style={{ flex: 1, backgroundColor: '#000d18' }} contentContainerStyle={{ padding: 16, gap: 7 }}>
    {map ? <MapLocationCard marker={marker} onClose={() => {}} /> : <>
      <ProfileHeader profile={p} tattooStyles={['Fine line', 'Blackwork', 'Realism', 'Minimalism', 'Lettering', 'Geometric']} verificationStatus="approved" onPortfolio={() => {}} actions={<>
        <Pressable style={profileActionStyles.button}><Text style={profileActionStyles.text}>{own ? 'Modifier le profil' : 'Suivre'}</Text></Pressable>
        {!own ? <Pressable style={[profileActionStyles.button, profileActionStyles.secondary]}><Text style={[profileActionStyles.text, profileActionStyles.secondaryText]}>Message</Text></Pressable> : null}
      </>} />
      <ProfileTabs tab="posts" canViewLiked onChange={() => {}} />
      <ProfilePostGrid posts={[{ id: 1, content: 'Tattoo', media: [] }, { id: 2, content: 'Portfolio', media: [] }, { id: 3, content: 'Blackwork', media: [] }]} />
    </>}
  </ScrollView>;
}
function App() { return <FontProvider><LanguageProvider><Preview /></LanguageProvider></FontProvider>; }
registerRootComponent(App);
`);
