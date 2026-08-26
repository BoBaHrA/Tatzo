import { Redirect, Tabs } from 'expo-router';
import { Image, type ColorValue, type ImageSourcePropType } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { useChat } from '@/chat/chat-context';
import { t } from '@/i18n';
import { colors } from '@/theme';


const WEB_ICONS = {
  home: require('../../assets/web-icons/house.png'),
  search: require('../../assets/web-icons/loupe.png'),
  map: require('../../assets/web-icons/maps.png'),
  chats: require('../../assets/web-icons/chats.png'),
  calendar: require('../../assets/web-icons/calendar.png'),
} satisfies Record<string, ImageSourcePropType>;

function WebTabIcon({
  source,
  color,
}: {
  source: ImageSourcePropType;
  color: ColorValue;
}) {
  return (
    <Image
      resizeMode="contain"
      source={source}
      style={{ width: 25, height: 25, tintColor: color }}
    />
  );
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
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.primary,
        tabBarActiveBackgroundColor: 'rgba(238, 12, 111, 0.07)',
        tabBarInactiveBackgroundColor: colors.backgroundDeep,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: 'rgba(0, 9, 17, 0.98)',
          borderTopColor: 'rgba(4, 197, 191, 0.18)',
          borderTopWidth: 1,
          height: 76,
          paddingTop: 7,
          paddingHorizontal: 10,
          paddingBottom: 7,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          lineHeight: 11,
          fontWeight: '700',
          marginTop: 2,
        },
        tabBarItemStyle: {
          borderRadius: 16,
          overflow: 'hidden',
          marginHorizontal: 1,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t('home'),
          tabBarIcon: ({ color }) => <WebTabIcon color={color} source={WEB_ICONS.home} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t('search'),
          tabBarIcon: ({ color }) => <WebTabIcon color={color} source={WEB_ICONS.search} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: t('mapTab'),
          tabBarIcon: ({ color }) => <WebTabIcon color={color} source={WEB_ICONS.map} />,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: t('chats'),
          tabBarBadge: unreadCount ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.accent,
            color: colors.white,
            fontSize: 9,
          },
          tabBarIcon: ({ color }) => <WebTabIcon color={color} source={WEB_ICONS.chats} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: t('calendar'),
          tabBarIcon: ({ color }) => <WebTabIcon color={color} source={WEB_ICONS.calendar} />,
        }}
      />

      <Tabs.Screen name="match" options={{ href: null }} />
      <Tabs.Screen name="bookings" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}
