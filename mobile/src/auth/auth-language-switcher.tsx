import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useLanguage, type AppLanguage } from '@/localization/language-context';
import { colors, radius, spacing } from '@/theme';


const OPTIONS: { code: AppLanguage; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'fr', label: 'FR' },
  { code: 'ru', label: 'RU' },
];

export function AuthLanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  return (
    <View accessibilityRole="radiogroup" style={styles.container}>
      {OPTIONS.map((option) => {
        const active = language === option.code;
        return (
          <Pressable
            key={option.code}
            accessibilityLabel={option.label}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            onPress={() => void setLanguage(option.code)}
            style={({ pressed }) => [
              styles.button,
              active && styles.active,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.label, active && styles.activeLabel]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    gap: spacing.xs,
    padding: 5,
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.22)',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0, 9, 17, 0.86)',
  },
  button: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: colors.surfaceSoft,
  },
  active: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.24,
    shadowRadius: 8,
    elevation: 2,
  },
  label: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  activeLabel: {
    color: colors.primary,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.96 }],
  },
});
