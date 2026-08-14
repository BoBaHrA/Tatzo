import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Tatzo',
  slug: 'tatzo',
  owner: process.env.EXPO_PUBLIC_EXPO_OWNER,
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/tatzo-icon.png',
  scheme: 'tatzo',
  userInterfaceStyle: 'dark',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'eu.tatzo.app',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'eu.tatzo.app',
    adaptiveIcon: {
      foregroundImage: './assets/tatzo-icon.png',
      backgroundColor: '#000d18',
    },
  },
  plugins: [
    'expo-router',
    'expo-localization',
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow Tatzo to attach tattoo references to your messages.',
        cameraPermission: false,
        microphonePermission: false,
      },
    ],
    [
      'expo-secure-store',
      {
        configureAndroidBackup: true,
        faceIDPermission: 'Allow Tatzo to access your Face ID biometric data.',
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/tatzo-icon.png',
        imageWidth: 180,
        resizeMode: 'contain',
        backgroundColor: '#000d18',
        dark: {
          backgroundColor: '#000d18',
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    apiBaseUrl:
      process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://tatzo.eu/api/v1',
    eas: {
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
    },
  },
});
