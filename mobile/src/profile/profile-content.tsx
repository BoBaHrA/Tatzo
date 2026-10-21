import { Image, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { FeedPost } from '@/api/types';
import { Text } from '@/components/text';
import type { ProfileContentTab } from './profile-types';
import { profileCopy as copy } from './profile-copy';

export function ProfileTabs({ tab, canViewLiked, onChange }: { tab: ProfileContentTab; canViewLiked: boolean; onChange: (tab: ProfileContentTab) => void }) {
  return <View style={styles.tabs}>{(['posts', ...(canViewLiked ? ['liked'] : [])] as ProfileContentTab[]).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => onChange(value)} style={[styles.tab, tab === value && styles.tabActive]}><Text style={[styles.tabText, tab === value && styles.tabTextActive]}>{value === 'posts' ? copy('Posts', 'Publications', 'Публикации') : copy('Liked', 'Aimées', 'Понравившиеся')}</Text></Pressable>)}</View>;
}

export function ProfilePostGrid({ posts }: { posts: FeedPost[] }) {
  return <View style={styles.postsGrid}>{posts.map(post => <PostTile key={post.id} post={post} />)}</View>;
}

function PostTile({ post }: { post: FeedPost }) {
  const media = post.media[0];
  return <Pressable accessibilityRole="button" accessibilityLabel={post.content || copy('Open post', 'Ouvrir la publication', 'Открыть публикацию')} onPress={() => router.push({ pathname: '/post/[postId]', params: { postId: String(post.id) } })} style={({ pressed }) => [styles.postTile, pressed && styles.pressed]}>
    {media?.type === 'image' ? <Image source={{ uri: media.url }} style={styles.postMedia} /> : <View style={styles.placeholder}><Text numberOfLines={4} style={styles.placeholderText}>{media?.type === 'video' ? '▶' : post.content || 'Tatzo'}</Text></View>}
    {post.media.length > 1 ? <View style={styles.count}><Text style={styles.countText}>{post.media.length}</Text></View> : null}
  </Pressable>;
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 4, padding: 5, backgroundColor: '#00131d', borderWidth: 1, borderColor: '#012c35', borderRadius: 12 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 6, borderRadius: 9 }, tabActive: { backgroundColor: 'rgba(4,197,191,.14)' }, tabText: { color: '#77a8ad', fontSize: 12, fontWeight: '800' }, tabTextActive: { color: '#dffefe' },
  postsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 }, postTile: { width: '32.5%', aspectRatio: 1, borderRadius: 8, overflow: 'hidden', backgroundColor: '#021722', borderWidth: 1, borderColor: 'rgba(4,197,191,.08)' },
  postMedia: { width: '100%', height: '100%' }, placeholder: { flex: 1, padding: 8, alignItems: 'center', justifyContent: 'center' }, placeholderText: { color: '#84aeb2', fontSize: 11, textAlign: 'center' },
  count: { position: 'absolute', right: 5, top: 5, borderRadius: 10, paddingHorizontal: 5, paddingVertical: 2, backgroundColor: 'rgba(0,9,17,.78)' }, countText: { color: '#fff', fontSize: 10, fontWeight: '800' }, pressed: { opacity: .72 },
});
