import { Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';
import { colors, radius, spacing } from '@/theme';


type BodyPlacementPickerProps = {
  options: string[];
  labels: Record<string, string>;
  selected: string[];
  onChange: (placements: string[]) => void;
};

function Figure({ back = false }: { back?: boolean }) {
  return (
    <View style={styles.figureWrap}>
      <Text style={styles.figureLabel}>{t(back ? 'bodyBack' : 'bodyFront')}</Text>
      <View style={styles.figure}>
        <View style={styles.head} />
        <View style={styles.neck} />
        <View style={[styles.torso, back && styles.backTorso]} />
        <View style={[styles.arm, styles.leftArm]} />
        <View style={[styles.arm, styles.rightArm]} />
        <View style={[styles.leg, styles.leftLeg]} />
        <View style={[styles.leg, styles.rightLeg]} />
        <View style={[styles.marker, { top: back ? 75 : 58 }]} />
        <View style={[styles.marker, { top: back ? 113 : 101 }]} />
      </View>
    </View>
  );
}

export function BodyPlacementPicker({
  labels,
  onChange,
  options,
  selected,
}: BodyPlacementPickerProps) {
  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.figures}>
        <Figure />
        <Figure back />
      </View>
      <Text style={styles.hint}>{t('placementHint')}</Text>
      <View style={styles.options}>
        {options.map((option) => {
          const active = selected.includes(option);
          return (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              key={option}
              onPress={() => toggle(option)}
              style={({ pressed }) => [
                styles.option,
                active && styles.optionActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.optionText, active && styles.optionTextActive]}>
                {labels[option] ?? option}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.backgroundDeep,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.medium,
    padding: spacing.md,
    gap: spacing.md,
  },
  figures: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xl },
  figureWrap: { alignItems: 'center', gap: spacing.xs },
  figureLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
  figure: { width: 78, height: 190, position: 'relative' },
  head: {
    position: 'absolute', top: 0, left: 29, width: 22, height: 27,
    borderRadius: 12, backgroundColor: colors.surfaceRaised,
    borderWidth: 1, borderColor: colors.primaryMuted,
  },
  neck: {
    position: 'absolute', top: 24, left: 35, width: 10, height: 10,
    backgroundColor: colors.surfaceRaised,
  },
  torso: {
    position: 'absolute', top: 32, left: 18, width: 44, height: 78,
    borderRadius: 18, backgroundColor: colors.surfaceRaised,
    borderWidth: 1, borderColor: colors.primaryMuted,
  },
  backTorso: { borderColor: colors.accent },
  arm: {
    position: 'absolute', top: 37, width: 13, height: 91,
    borderRadius: 7, backgroundColor: colors.surfaceRaised,
    borderWidth: 1, borderColor: colors.primaryMuted,
  },
  leftArm: { left: 3, transform: [{ rotate: '7deg' }] },
  rightArm: { right: 3, transform: [{ rotate: '-7deg' }] },
  leg: {
    position: 'absolute', top: 104, width: 17, height: 82,
    borderRadius: 9, backgroundColor: colors.surfaceRaised,
    borderWidth: 1, borderColor: colors.primaryMuted,
  },
  leftLeg: { left: 20, transform: [{ rotate: '2deg' }] },
  rightLeg: { right: 20, transform: [{ rotate: '-2deg' }] },
  marker: {
    position: 'absolute', left: 36, width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.accent,
  },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  option: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  optionText: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  optionTextActive: { color: colors.white },
  pressed: { opacity: 0.68 },
});
