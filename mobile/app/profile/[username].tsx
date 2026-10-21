import { useLocalSearchParams } from 'expo-router';
import { ProfileScreen } from '@/profile/profile-screen';

export default function PublicProfileScreen() {
  const params = useLocalSearchParams<{ username?: string | string[] }>();
  const username = (Array.isArray(params.username) ? params.username[0] : params.username) ?? '';
  return <ProfileScreen key={username} username={username} />;
}
