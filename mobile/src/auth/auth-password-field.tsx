import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, layout, radius, spacing, typography } from '@/theme';


type AuthPasswordFieldProps = Omit<TextInputProps, 'secureTextEntry'> & {
  label: string;
  showLabel: string;
  hideLabel: string;
  helperText?: string;
  errorText?: string;
};

export function AuthPasswordField({
  label,
  showLabel,
  hideLabel,
  helperText,
  errorText,
  style,
  onFocus,
  onBlur,
  ...props
}: AuthPasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrap, focused && styles.focused, Boolean(errorText) && styles.errorInput]}>
        <TextInput
          {...props}
          accessibilityLabel={label}
          secureTextEntry={!visible}
          placeholderTextColor={colors.textSubtle}
          selectionColor={colors.primary}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[styles.input, style]}
        />
        <Pressable
          accessibilityLabel={visible ? hideLabel : showLabel}
          accessibilityRole="button"
          onPress={() => setVisible((current) => !current)}
          style={({ pressed }) => [styles.eyeButton, pressed && styles.pressed]}
        >
          <View style={styles.eyeOutline}>
            <View style={styles.eyePupil} />
          </View>
          {!visible ? <View style={styles.eyeSlash} /> : null}
        </Pressable>
      </View>
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
    color: colors.primary,
    ...typography.caption,
    fontWeight: '700',
  },
  inputWrap: {
    minHeight: layout.controlHeight,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.small,
    backgroundColor: colors.surfaceSoft,
  },
  focused: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceInteractive,
    shadowColor: colors.primary,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 1,
  },
  errorInput: {
    borderColor: colors.danger,
  },
  input: {
    flex: 1,
    minHeight: layout.controlHeight - 2,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
  },
  eyeButton: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  eyeOutline: {
    width: 21,
    height: 13,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyePupil: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  eyeSlash: {
    position: 'absolute',
    width: 24,
    height: 1.5,
    backgroundColor: colors.primary,
    transform: [{ rotate: '-38deg' }],
  },
  helperText: {
    color: colors.textSubtle,
    ...typography.caption,
  },
  errorText: {
    color: colors.danger,
    ...typography.caption,
  },
  pressed: {
    opacity: 0.65,
  },
});
