#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const passed = [];

function source(relativePath) {
  const absolutePath = join(projectRoot, relativePath);
  if (!existsSync(absolutePath)) {
    failures.push(`${relativePath} exists`);
    return '';
  }
  return readFileSync(absolutePath, 'utf8');
}

function check(condition, label) {
  if (condition) passed.push(label);
  else failures.push(label);
}

const list = source('app/(tabs)/chats.tsx');
const thread = source('app/chat/[threadId].tsx');

check(!list.includes('chatsEyebrow'), 'Chat list no longer renders the legacy oversized intro hierarchy');
check(list.includes('rowShell'), 'Chat threads share one web-style list surface');
check(list.includes('unreadBadge') && list.includes('colors.accent'), 'Unread state keeps the Tatzo pink badge hierarchy');
check(list.includes('RefreshControl'), 'Chat list preserves pull-to-refresh');

check(thread.includes("backgroundColor: 'rgba(0, 18, 28, 0.98)'"), 'Thread header uses the web chat surface');
check(thread.includes("borderColor: colors.primary") && thread.includes('headerAvatar'), 'Thread avatar keeps the Tatzo cyan identity ring');
check(thread.includes("backgroundColor: 'rgba(4, 197, 191, 0.14)'"), 'Own messages use the web cyan-tinted bubble');
check(thread.includes("backgroundColor: 'rgba(255, 255, 255, 0.045)'"), 'Incoming messages use the web subtle neutral bubble');
check(thread.includes("borderBottomRightRadius: 6") && thread.includes("borderBottomLeftRadius: 6"), 'Message bubbles preserve directional web corners');
check(thread.includes("borderRadius: 15") && thread.includes('attachButton') && thread.includes('sendButton'), 'Composer uses aligned web-style controls instead of circular pills');
check(thread.includes('sendChatMessage('), 'Chat sending remains wired to the real API');
check(thread.includes('editChatMessage(') && thread.includes('deleteChatMessage('), 'Message edit/delete remain available');
check(thread.includes('toggleProfileBlock('), 'User blocking remains available');
check(thread.includes('setInterval(async () =>') && thread.includes('2_500'), 'Live chat polling remains enabled');
check(thread.includes('fetchHealingDetail(') && thread.includes('healing.chat_draft'), 'Healing chat context remains wired');
check(thread.includes('DocumentPicker') && thread.includes('ImagePicker'), 'Media and file attachments remain supported');

console.log('\nTatzo mobile chat parity check');
for (const label of passed) console.log(`  ✓ ${label}`);
for (const label of failures) console.error(`  ✗ ${label}`);
console.log(`\n${passed.length} passed, ${failures.length} failure(s).`);

if (failures.length) process.exit(1);
