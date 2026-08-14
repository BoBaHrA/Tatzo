import type {
  ChatListResponse,
  ChatMessage,
  ChatThreadDetail,
  ChatThreadSummary,
} from '@/api/types';
import type { AuthenticatedRequest } from '@/auth/auth-context';


export type PendingChatAttachment = {
  key: string;
  uri: string;
  name: string;
  mimeType: string;
  type: 'image' | 'video' | 'file';
};

function attachmentBody(attachment: PendingChatAttachment): Blob {
  return {
    uri: attachment.uri,
    name: attachment.name,
    type: attachment.mimeType || 'application/octet-stream',
  } as unknown as Blob;
}

export function fetchChats(request: AuthenticatedRequest) {
  return request<ChatListResponse>('/chat/');
}

export function startChat(
  request: AuthenticatedRequest,
  username: string,
) {
  return request<ChatThreadSummary>(
    `/chat/start/${encodeURIComponent(username)}/`,
    { method: 'POST' },
  );
}

export function fetchChatThread(
  request: AuthenticatedRequest,
  threadId: number,
  cursor?: { after?: number; before?: number },
) {
  const search = new URLSearchParams();
  if (cursor?.after) search.set('after', String(cursor.after));
  if (cursor?.before) search.set('before', String(cursor.before));
  const query = search.toString();
  return request<ChatThreadDetail>(
    `/chat/${threadId}/${query ? `?${query}` : ''}`,
  );
}

export function sendChatMessage(
  request: AuthenticatedRequest,
  threadId: number,
  content: string,
  attachments: PendingChatAttachment[],
) {
  const body = new FormData();
  body.append('content', content);
  attachments.forEach((attachment) => {
    body.append('attachments', attachmentBody(attachment));
  });
  return request<ChatMessage>(`/chat/${threadId}/messages/`, {
    method: 'POST',
    body,
  });
}

export function editChatMessage(
  request: AuthenticatedRequest,
  messageId: number,
  content: string,
  deleteAttachmentIds: number[] = [],
  attachments: PendingChatAttachment[] = [],
) {
  const body = new FormData();
  body.append('content', content);
  deleteAttachmentIds.forEach((attachmentId) => {
    body.append('delete_attachment_ids', String(attachmentId));
  });
  attachments.forEach((attachment) => {
    body.append('attachments', attachmentBody(attachment));
  });
  return request<ChatMessage>(`/chat/messages/${messageId}/`, {
    method: 'PATCH',
    body,
  });
}

export function deleteChatMessage(
  request: AuthenticatedRequest,
  messageId: number,
) {
  return request<void>(`/chat/messages/${messageId}/`, { method: 'DELETE' });
}
