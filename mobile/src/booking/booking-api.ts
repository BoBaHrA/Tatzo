import type {
  Appointment,
  AppointmentAction,
  AppointmentListResponse,
  BookingConfig,
  BookingType,
  HealthSafetyShareMode,
  HealthSafetyValues,
} from '@/api/types';
import type { AuthenticatedRequest } from '@/auth/auth-context';


export type PendingBookingReference = {
  key: string;
  uri: string;
  name: string;
  mimeType: string;
};

export type BookingDraft = {
  bookingType: BookingType;
  date: string;
  startTime: string;
  duration: number;
  comfortLimit: string;
  styles: string[];
  placements: string[];
  size: string;
  budget: string;
  description: string;
  consultationAlreadyCompleted: boolean;
  consultationNote: string;
  references: PendingBookingReference[];
  healthSafety: {
    mode: HealthSafetyShareMode;
    values: HealthSafetyValues;
    otherRelevantInformation: string;
    confirmedNone: boolean;
    shareConsent: boolean;
    saveToCard: boolean;
  };
};

function referenceBody(reference: PendingBookingReference): Blob {
  return {
    uri: reference.uri,
    name: reference.name,
    type: reference.mimeType || 'image/jpeg',
  } as unknown as Blob;
}

export function fetchBookingConfig(
  request: AuthenticatedRequest,
  username: string,
) {
  return request<BookingConfig>(
    `/appointments/book/${encodeURIComponent(username)}/`,
  );
}

export function createBooking(
  request: AuthenticatedRequest,
  username: string,
  draft: BookingDraft,
) {
  const body = new FormData();
  body.append('booking_type', draft.bookingType);
  body.append('date', draft.date);
  body.append('start_time', draft.startTime);
  body.append('session_length_minutes', String(draft.duration));
  body.append('client_comfort_limit', draft.comfortLimit);
  draft.styles.forEach((style) => body.append('styles', style));
  draft.placements.forEach((placement) => body.append('placements', placement));
  body.append('size', draft.size);
  body.append('budget', draft.budget);
  body.append('description', draft.description);
  body.append(
    'consultation_already_completed',
    draft.consultationAlreadyCompleted ? 'true' : 'false',
  );
  body.append('consultation_note', draft.consultationNote);
  body.append('health_mode', draft.healthSafety.mode);
  if (draft.healthSafety.mode === 'quick') {
    Object.entries(draft.healthSafety.values).forEach(([key, value]) => {
      body.append(key, value ? 'true' : 'false');
    });
    body.append(
      'health_other_relevant_information',
      draft.healthSafety.otherRelevantInformation,
    );
    body.append(
      'health_confirmed_none',
      draft.healthSafety.confirmedNone ? 'true' : 'false',
    );
    body.append(
      'health_share_consent',
      draft.healthSafety.shareConsent ? 'true' : 'false',
    );
    body.append(
      'health_save_to_card',
      draft.healthSafety.saveToCard ? 'true' : 'false',
    );
  }
  draft.references.forEach((reference) => {
    body.append('references', referenceBody(reference));
  });
  return request<Appointment>(
    `/appointments/book/${encodeURIComponent(username)}/`,
    { method: 'POST', body },
  );
}

export function fetchAppointments(request: AuthenticatedRequest) {
  return request<AppointmentListResponse>('/appointments/');
}

export function fetchAppointment(
  request: AuthenticatedRequest,
  appointmentId: number,
) {
  return request<Appointment>(`/appointments/${appointmentId}/`);
}

export function applyAppointmentAction(
  request: AuthenticatedRequest,
  appointmentId: number,
  action: AppointmentAction,
) {
  return request<Appointment>(`/appointments/${appointmentId}/action/`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
}

export function addAppointmentReferences(
  request: AuthenticatedRequest,
  appointmentId: number,
  references: PendingBookingReference[],
) {
  const body = new FormData();
  references.forEach((reference) => {
    body.append('references', referenceBody(reference));
  });
  return request<Appointment>(`/appointments/${appointmentId}/references/`, {
    method: 'POST',
    body,
  });
}
