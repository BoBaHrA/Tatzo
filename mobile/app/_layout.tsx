import 'react-native-gesture-handler';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from '@/auth/auth-context';
import { SessionBoundary } from '@/auth/session-boundary';
import { ChatProvider } from '@/chat/chat-context';
import { LanguageProvider } from '@/localization/language-context';
import { NotificationProvider } from '@/notifications/notification-context';
import { FontProvider } from '@/components/text';
import { colors } from '@/theme';


export default function RootLayout() {
  return (
    <FontProvider>
    <LanguageProvider>
      <AuthProvider>
        <SessionBoundary>
        <AccountProviders>
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="edit-profile" options={{ presentation: 'modal' }} />
              <Stack.Screen name="artist-verification" options={{ presentation: 'modal' }} />
              <Stack.Screen name="create-post" options={{ presentation: 'modal' }} />
              <Stack.Screen name="manage-portfolio" />
              <Stack.Screen name="blocked-users" />
              <Stack.Screen name="delete-account" options={{ presentation: 'modal' }} />
              <Stack.Screen name="notifications" />
              <Stack.Screen name="profile/[username]" />
              <Stack.Screen name="profile/[username]/portfolio" />
              <Stack.Screen name="post/[postId]" />
              <Stack.Screen name="chat/[threadId]" />
              <Stack.Screen name="booking/[username]" />
              <Stack.Screen name="appointment/[appointmentId]" />
              <Stack.Screen name="appointment/[appointmentId]/reschedule" />
              <Stack.Screen name="artist-dashboard/index" />
              <Stack.Screen name="artist-dashboard/create-appointment" />
              <Stack.Screen name="artist-dashboard/preferences" />
              <Stack.Screen name="artist-dashboard/schedule" />
              <Stack.Screen name="artist-dashboard/calendar" />
              <Stack.Screen name="artist-dashboard/payments" />
              <Stack.Screen name="map/add-location" options={{ presentation: 'modal' }} />
              <Stack.Screen name="map/claim/[locationId]" options={{ presentation: 'modal' }} />
            </Stack>
        </AccountProviders>
        </SessionBoundary>
      </AuthProvider>
    </LanguageProvider>
    </FontProvider>
  );
}

function AccountProviders({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return <NotificationProvider key={user?.id ?? 'guest'}><ChatProvider>{children}</ChatProvider></NotificationProvider>;
}
