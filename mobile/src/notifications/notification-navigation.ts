import { router } from 'expo-router';

import type { NotificationTarget } from '@/api/types';


export function notificationTargetFromPushData(
  data: Record<string, unknown>,
): NotificationTarget | null {
  const targetType = data.targetType;
  if (targetType === 'profile' && typeof data.targetUsername === 'string') {
    const username = data.targetUsername.trim();
    return username ? { type: 'profile', username } : null;
  }
  if (
    targetType === 'post'
    || targetType === 'appointment'
    || targetType === 'chat'
  ) {
    const id = Number(data.targetId);
    if (!Number.isSafeInteger(id) || id < 1) return null;
    return { type: targetType, id };
  }
  if (targetType === 'none') return { type: 'none' };
  return null;
}

export function navigateToNotificationTarget(target: NotificationTarget) {
  if (target.type === 'profile') {
    router.push({
      pathname: '/profile/[username]',
      params: { username: target.username },
    });
  } else if (target.type === 'post') {
    router.push({
      pathname: '/post/[postId]',
      params: { postId: String(target.id) },
    });
  } else if (target.type === 'appointment') {
    router.push({
      pathname: '/appointment/[appointmentId]',
      params: { appointmentId: String(target.id) },
    });
  } else if (target.type === 'chat') {
    router.push({
      pathname: '/chat/[threadId]',
      params: { threadId: String(target.id) },
    });
  }
}
