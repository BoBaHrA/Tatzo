import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { AuthenticatedRequest } from '@/auth/auth-context';
import { appLanguage, t } from '@/i18n';


const INSTALLATION_ID_KEY = 'tatzo.push-installation-id';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PushRegistrationResponse = {
  registered: boolean;
  created: boolean;
  platform: 'ios' | 'android';
};

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

function createInstallationId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

async function getOrCreateInstallationId() {
  const stored = await SecureStore.getItemAsync(INSTALLATION_ID_KEY);
  if (stored && UUID_RE.test(stored)) return stored;
  const installationId = createInstallationId();
  await SecureStore.setItemAsync(INSTALLATION_ID_KEY, installationId);
  return installationId;
}

function easProjectId() {
  const extra = Constants.expoConfig?.extra as {
    eas?: { projectId?: unknown };
  } | undefined;
  const configured = extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof configured === 'string' && configured ? configured : null;
}

async function ensurePermissionAndToken() {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('activity', {
      name: t('pushChannelName'),
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#e0ff4f',
      showBadge: true,
      sound: 'default',
      vibrationPattern: [0, 200, 120, 200],
    });
  }

  const current = await Notifications.getPermissionsAsync();
  const permission = current.status === 'granted'
    ? current
    : await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
  if (permission.status !== 'granted') return null;

  const projectId = easProjectId();
  if (!projectId) return null;
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

export async function registerPushDevice(request: AuthenticatedRequest) {
  const expoPushToken = await ensurePermissionAndToken();
  if (!expoPushToken || (Platform.OS !== 'ios' && Platform.OS !== 'android')) {
    return false;
  }
  const installationId = await getOrCreateInstallationId();
  await request<PushRegistrationResponse>('/push/devices/', {
    method: 'PUT',
    body: JSON.stringify({
      installation_id: installationId,
      expo_push_token: expoPushToken,
      platform: Platform.OS,
      locale: appLanguage,
      app_version: Constants.expoConfig?.version ?? '',
    }),
  });
  return true;
}

export async function unregisterPushDevice(request: AuthenticatedRequest) {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  const installationId = await SecureStore.getItemAsync(INSTALLATION_ID_KEY);
  if (!installationId || !UUID_RE.test(installationId)) return;
  await request<void>('/push/devices/', {
    method: 'DELETE',
    body: JSON.stringify({ installation_id: installationId }),
  });
}
