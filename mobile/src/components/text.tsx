import { createContext, useContext, type PropsWithChildren } from 'react';
import { Platform, StyleSheet, Text as NativeText, type TextProps } from 'react-native';
import { useFonts, Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, Poppins_700Bold, Poppins_800ExtraBold, Poppins_900Black } from '@expo-google-fonts/poppins';

const FontsReady = createContext(false);
const FONTS = { Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, Poppins_700Bold, Poppins_800ExtraBold, Poppins_900Black };
const WEIGHTS: Record<string, string> = { normal: 'Poppins_400Regular', bold: 'Poppins_700Bold', '400': 'Poppins_400Regular', '500': 'Poppins_500Medium', '600': 'Poppins_600SemiBold', '700': 'Poppins_700Bold', '800': 'Poppins_800ExtraBold', '900': 'Poppins_900Black' };
export function FontProvider({ children }: PropsWithChildren) {
  const [ready] = useFonts(FONTS);
  return <FontsReady.Provider value={ready}>{children}</FontsReady.Provider>;
}
/** The same Poppins weights used by Tatzo's web cards, bundled for offline use. */
export function Text({ style, ...props }: TextProps) {
  const ready = useContext(FontsReady);
  const flat = StyleSheet.flatten(style);
  const family = ready && !flat?.fontFamily ? WEIGHTS[flat?.fontWeight ?? '400'] : undefined;
  return <NativeText {...props} style={[style, family ? { fontFamily: Platform.OS === 'web' ? `"${family}", system-ui, sans-serif` : family, fontWeight: 'normal' } : undefined]} />;
}
