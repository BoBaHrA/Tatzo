#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const passed = [];

function source(path) {
  return readFileSync(join(root, path), 'utf8');
}

function check(condition, label) {
  (condition ? passed : failures).push(label);
}

const login = source('app/(auth)/login.tsx');
const register = source('app/(auth)/register.tsx');
const verify = source('app/(auth)/verify-email.tsx');
const shell = source('src/auth/auth-shell.tsx');
const passwordField = source('src/auth/auth-password-field.tsx');
const field = source('src/components/field.tsx');
const language = source('src/localization/language-context.tsx');
const client = source('src/api/client.ts');
const links = source('src/public-links.ts');

check(shell.includes("tatzo7.png"), 'Auth shell uses current Tatzo wordmark');
check(shell.includes('AuthLanguageSwitcher'), 'Auth shell exposes the language switcher');
check(login.includes('AuthPasswordField'), 'Login has a password visibility control');
check(login.includes('variant="accent"'), 'Login uses the web auth accent action');
check(login.includes('PUBLIC_LINKS.passwordReset'), 'Login exposes password reset');
check(register.includes('communityGuidelines'), 'Registration includes Community Guidelines consent');
check(register.includes('accountCard'), 'Registration uses account-type cards');
check(!register.includes('Switch'), 'Registration does not use a platform switch as the consent checkbox');
check(register.includes('usernameHint') && register.includes('passwordHint'), 'Registration preserves web signup guidance');
check(verify.includes('AuthShell'), 'Email verification shares the auth shell');
check(language.includes("'en' | 'fr' | 'ru'"), 'Language preference supports EN, FR and RU');
check(language.includes('SecureStore.setItemAsync'), 'Language preference persists between launches');
check(client.includes('getPreferredLanguage()'), 'API requests use the selected language');
check(passwordField.includes('secureTextEntry={!visible}'), 'Password field can show and hide its value');
check(
  passwordField.includes("autoComplete={android ? 'off' : autoComplete}")
    && passwordField.includes("importantForAutofill={android ? 'no' : importantForAutofill}"),
  'Android password input suppresses autofill focus hijacking',
);
check(
  field.includes("autoComplete={androidAuth ? 'off' : autoComplete}")
    && field.includes("importantForAutofill={androidAuth ? 'no' : importantForAutofill}"),
  'Android auth identity fields suppress autofill focus hijacking',
);
check(links.includes("passwordReset: 'https://tatzo.eu/password-reset/'"), 'Password reset points to the Tatzo web flow');

console.log('\nTatzo mobile auth parity check');
for (const label of passed) console.log(`  ✓ ${label}`);
for (const label of failures) console.error(`  ✗ ${label}`);
console.log(`\n${passed.length} passed, ${failures.length} failure(s).`);

if (failures.length) process.exit(1);
