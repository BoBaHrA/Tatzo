import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme';


type CheckboxProps = {
  checked: boolean;
  label: string;
  hint?: string;
  onChange: (checked: boolean) => void;
};

export function Checkbox({ checked, label, hint, onChange }: CheckboxProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? <Text style={styles.check}>✓</Text> : null}
      </View>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  box: {
    width: 20,
    height: 20,
    marginTop: 1,
    borderRadius: radius.small / 2,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.backgroundDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: {
    backgroundColor: colors.primary,
  },
  check: {
    color: colors.backgroundDeep,
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '900',
  },
  copy: { flex: 1, gap: 2 },
  label: { color: colors.text, ...typography.bodyStrong },
  hint: { color: colors.textMuted, ...typography.caption },
  pressed: { opacity: 0.7 },
});
