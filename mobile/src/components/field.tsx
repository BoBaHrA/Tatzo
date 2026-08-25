import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, layout, radius, spacing, typography } from '@/theme';


type FieldProps = TextInputProps & {
  label: string;
  helperText?: string;
  errorText?: string;
};

export function Field({
  label,
  helperText,
  errorText,
  multiline,
  style,
  onFocus,
  onBlur,
  ...props
}: FieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textSubtle}
        selectionColor={colors.primary}
        multiline={multiline}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          styles.input,
          focused && styles.focused,
          Boolean(errorText) && styles.errorInput,
          multiline && styles.multiline,
          style,
        ]}
        {...props}
      />
      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
      {!errorText && helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    color: colors.textMuted,
    ...typography.caption,
    fontWeight: '700',
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
    lineHeight: 20,
  },
  focused: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceSoft,
  },
  errorInput: {
    borderColor: colors.danger,
  },
  multiline: {
    minHeight: 104,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
  },
  helperText: {
    color: colors.textSubtle,
    ...typography.caption,
  },
  errorText: {
    color: colors.danger,
    ...typography.caption,
  },
});
