import type {
  AppointmentHealthSafety,
  HealthSafetyCard,
  HealthSafetyShareMode,
  HealthSafetyValues,
} from '@/api/types';
import type { AuthenticatedRequest } from '@/auth/auth-context';


export const EMPTY_HEALTH_VALUES: HealthSafetyValues = {
  bleeding_clotting_condition: false,
  blood_thinning_medication: false,
  diabetes_or_blood_sugar_condition: false,
  relevant_skin_condition: false,
  relevant_allergy_sensitivity: false,
  immune_or_healing_condition: false,
};

export function fetchHealthSafetyCard(request: AuthenticatedRequest) {
  return request<HealthSafetyCard>('/me/health-safety/');
}

export function saveHealthSafetyCard(
  request: AuthenticatedRequest,
  values: HealthSafetyValues,
  otherRelevantInformation: string,
) {
  return request<HealthSafetyCard>('/me/health-safety/', {
    method: 'PUT',
    body: JSON.stringify({
      ...values,
      other_relevant_information: otherRelevantInformation,
      explicit_storage_consent: true,
    }),
  });
}

export function deleteHealthSafetyCard(request: AuthenticatedRequest) {
  return request<void>('/me/health-safety/', { method: 'DELETE' });
}

export function fetchAppointmentHealthSafety(
  request: AuthenticatedRequest,
  appointmentId: number,
) {
  return request<AppointmentHealthSafety>(
    `/appointments/${appointmentId}/health-safety/`,
  );
}

export function shareAppointmentHealthSafety(
  request: AuthenticatedRequest,
  appointmentId: number,
  payload: {
    mode: Exclude<HealthSafetyShareMode, 'none'>;
    values?: HealthSafetyValues;
    otherRelevantInformation?: string;
    confirmedNone?: boolean;
    shareConsent?: boolean;
    saveToCard?: boolean;
  },
) {
  return request<AppointmentHealthSafety>(
    `/appointments/${appointmentId}/health-safety/`,
    {
      method: 'POST',
      body: JSON.stringify({
        mode: payload.mode,
        ...(payload.values ?? {}),
        other_relevant_information: payload.otherRelevantInformation ?? '',
        confirmed_none: payload.confirmedNone ?? false,
        share_consent: payload.shareConsent ?? false,
        save_to_card: payload.saveToCard ?? false,
      }),
    },
  );
}

export function revokeAppointmentHealthSafety(
  request: AuthenticatedRequest,
  appointmentId: number,
) {
  return request<void>(`/appointments/${appointmentId}/health-safety/`, {
    method: 'DELETE',
  });
}
