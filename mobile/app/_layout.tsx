import 'react-native-gesture-handler';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider } from '@/auth/auth-context';
import { ChatProvider } from '@/chat/chat-context';
import { NotificationProvider } from '@/notifications/notification-context';
import { colors } from '@/theme';


export default function RootLayout() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <ChatProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="edit-profile" options={{ presentation: 'modal' }} />
            <Stack.Screen name="blocked-users" />
            <Stack.Screen name="delete-account" options={{ presentation: 'modal' }} />
            <Stack.Screen name="notifications" />
            <Stack.Screen name="profile/[username]" />
            <Stack.Screen name="post/[postId]" />
            <Stack.Screen name="chat/[threadId]" />
            <Stack.Screen name="booking/[username]" />
            <Stack.Screen name="appointment/[appointmentId]" />
            <Stack.Screen name="map/add-location" options={{ presentation: 'modal' }} />
            <Stack.Screen name="map/claim/[locationId]" options={{ presentation: 'modal' }} />
          </Stack>
        </ChatProvider>
      </NotificationProvider>
    </AuthProvider>
  );
}
