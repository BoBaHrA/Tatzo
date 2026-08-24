import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, layout, radius, spacing } from '@/theme';


type FieldProps = TextInputProps & {
  label: string;
};

export function Field({ label, multiline, style, ...props }: FieldProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.primary}
        multiline={multiline}
        style={[styles.input, multiline && styles.multiline, style]}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  input: {
    minHeight: layout.controlHeight,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundDeep,
    color: colors.text,
    borderRadius: radius.medium,
    paddingHorizontal: spacing.md,
    fontSize: 15,
  },
  multiline: {
    minHeight: 108,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
  },
});
