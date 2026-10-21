import { useAuth } from '@/auth/auth-context';
import { ProfileScreen } from '@/profile/profile-screen';

export default function OwnProfileScreen() {
  const { user } = useAuth();
  return user ? <ProfileScreen key={user.username} username={user.username} own /> : null;
}
