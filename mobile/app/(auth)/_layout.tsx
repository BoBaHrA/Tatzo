import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/auth/auth-context';


export default function AuthLayout() {
  const { status } = useAuth();
  if (status === 'authenticated') {
    return <Redirect href="/(tabs)/home" />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
