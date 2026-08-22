import type {
  HealingDetail,
  HealingListResponse,
  HealingTaskSlug,
  HealingTaskUpdate,
} from '@/api/types';
import type { AuthenticatedRequest } from '@/auth/auth-context';


export type PendingHealingPhoto = {
  uri: string;
  name: string;
  mimeType: string;
};

function photoBody(photo: PendingHealingPhoto): Blob {
  return {
    uri: photo.uri,
    name: photo.name,
    type: photo.mimeType || 'image/jpeg',
  } as unknown as Blob;
}

export function fetchHealingJourneys(request: AuthenticatedRequest) {
  return request<HealingListResponse>('/healing/');
}

export function fetchHealingDetail(
  request: AuthenticatedRequest,
  journeyId: string,
) {
  return request<HealingDetail>(`/healing/${encodeURIComponent(journeyId)}/`);
}

export function startHealingJourney(
  request: AuthenticatedRequest,
  appointmentId: number,
) {
  return request<HealingDetail>(`/healing/appointments/${appointmentId}/`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function uploadHealingCheckIn(
  request: AuthenticatedRequest,
  journeyId: string,
  photo: PendingHealingPhoto,
  note: string,
  symptoms: string[],
) {
  const body = new FormData();
  body.append('photo', photoBody(photo));
  body.append('note', note);
  symptoms.forEach((symptom) => body.append('symptoms', symptom));
  return request<HealingDetail>(
    `/healing/${encodeURIComponent(journeyId)}/check-ins/`,
    { method: 'POST', body },
  );
}

export function setHealingTask(
  request: AuthenticatedRequest,
  journeyId: string,
  taskSlug: HealingTaskSlug,
  completed: boolean,
) {
  return request<HealingTaskUpdate>(
    `/healing/${encodeURIComponent(journeyId)}/tasks/${taskSlug}/`,
    { method: completed ? 'PUT' : 'DELETE' },
  );
}

export function markHealingJourneyHealed(
  request: AuthenticatedRequest,
  journeyId: string,
) {
  return request<HealingDetail>(
    `/healing/${encodeURIComponent(journeyId)}/mark-healed/`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}
