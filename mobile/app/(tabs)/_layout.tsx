import { Redirect, Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { useChat } from '@/chat/chat-context';
import { t } from '@/i18n';
import { colors, radius } from '@/theme';


function TabSymbol({ symbol, color }: { symbol: string; color: ColorValue }) {
  return <Text style={{ color, fontSize: 18, lineHeight: 20, fontWeight: '700' }}>{symbol}</Text>;
}

export default function TabsLayout() {
  const { status } = useAuth();
  const { unreadCount } = useChat();
  if (status === 'anonymous') {
    return <Redirect href="/(auth)/login" />;
  }
  return (
    <Tabs
      initialRouteName="home"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.primary,
        tabBarActiveBackgroundColor: colors.accentSoft,
        tabBarInactiveBackgroundColor: colors.backgroundDeep,
        tabBarStyle: {
          backgroundColor: colors.backgroundDeep,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingTop: 4,
          paddingHorizontal: 4,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          paddingBottom: 4,
        },
        tabBarItemStyle: {
          marginHorizontal: 1,
          marginVertical: 3,
          borderRadius: radius.medium,
          overflow: 'hidden',
        },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="home" options={{ title: t('home'), tabBarIcon: ({ color }) => <TabSymbol symbol="⌂" color={color} /> }} />
      <Tabs.Screen name="map" options={{ title: t('mapTab'), tabBarIcon: ({ color }) => <TabSymbol symbol="⌖" color={color} /> }} />
      <Tabs.Screen name="match" options={{ title: t('styleMatch'), tabBarIcon: ({ color }) => <TabSymbol symbol="✦" color={color} /> }} />
      <Tabs.Screen name="bookings" options={{ title: t('bookings'), tabBarIcon: ({ color }) => <TabSymbol symbol="⌁" color={color} /> }} />
      <Tabs.Screen
        name="chats"
        options={{
          title: t('chats'),
          tabBarBadge: unreadCount ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.accent, color: colors.white, fontSize: 9 },
          tabBarIcon: ({ color }) => <TabSymbol symbol="◇" color={color} />,
        }}
      />
      <Tabs.Screen name="profile" options={{ title: t('profile'), tabBarIcon: ({ color }) => <TabSymbol symbol="◎" color={color} /> }} />
    </Tabs>
  );
}
