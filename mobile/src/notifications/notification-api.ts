import type {
  NotificationCountResponse,
  NotificationPage,
  NotificationReadResponse,
} from '@/api/types';
import type { AuthenticatedRequest } from '@/auth/auth-context';


export function fetchNotifications(
  request: AuthenticatedRequest,
  cursor?: string | null,
): Promise<NotificationPage> {
  const cursorQuery = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
  return request<NotificationPage>(`/notifications/?limit=20${cursorQuery}`);
}

export function fetchNotificationCount(request: AuthenticatedRequest) {
  return request<NotificationCountResponse>('/notifications/unread-count/');
}

export function markNotificationRead(
  request: AuthenticatedRequest,
  notificationId: number,
) {
  return request<NotificationReadResponse>(
    `/notifications/${notificationId}/read/`,
    { method: 'POST' },
  );
}

export function markAllNotificationsRead(request: AuthenticatedRequest) {
  return request<NotificationReadResponse>('/notifications/read-all/', {
    method: 'POST',
  });
}
