import type { ConfigContext, ExpoConfig } from 'expo/config';

const androidMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY;
const expoOwner = 'tatzo';
const easProjectId = '38bcf2cb-ad7b-49bf-a0f4-3055e371caa2';
const mapsPlugin: NonNullable<ExpoConfig['plugins']>[number] = androidMapsApiKey
  ? [
      'react-native-maps',
      { androidGoogleMapsApiKey: androidMapsApiKey },
    ]
  : 'react-native-maps';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Tatzo',
  slug: 'tatzo',
  owner: expoOwner,
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/tatzo-app-icon.png',
  scheme: 'tatzo',
  userInterfaceStyle: 'dark',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'eu.tatzo.app',
    icon: './assets/tatzo-app-icon.png',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'eu.tatzo.app',
    icon: './assets/tatzo-app-icon.png',
    adaptiveIcon: {
      foregroundImage: './assets/tatzo-adaptive-icon.png',
      monochromeImage: './assets/tatzo-monochrome-icon.png',
      backgroundColor: '#000d18',
    },
  },
  web: {
    favicon: './assets/tatzo-app-icon.png',
  },
  plugins: [
    'expo-router',
    'expo-localization',
    'expo-notifications',
    mapsPlugin,
    [
      'expo-location',
      {
        locationWhenInUsePermission: 'Allow Tatzo to show tattoo artists and studios near you.',
      },
    ],
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
        image: './assets/tatzo-adaptive-icon.png',
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
      projectId: easProjectId,
    },
  },
});
