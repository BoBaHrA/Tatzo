import type {
  AppointmentDeposit,
  ArtistPaymentSettings,
} from '@/api/types';
import type { AuthenticatedRequest } from '@/auth/auth-context';


export function fetchArtistPaymentSettings(request: AuthenticatedRequest) {
  return request<ArtistPaymentSettings>('/artist/payments/');
}

export function startArtistPaymentOnboarding(request: AuthenticatedRequest) {
  return request<{ url: string }>('/artist/payments/connect/', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function saveArtistDepositSettings(
  request: AuthenticatedRequest,
  depositRequired: boolean,
  depositAmount: string,
) {
  return request<ArtistPaymentSettings>('/artist/payments/', {
    method: 'PATCH',
    body: JSON.stringify({
      deposit_required: depositRequired,
      deposit_amount: depositAmount,
    }),
  });
}

export function fetchAppointmentDeposit(
  request: AuthenticatedRequest,
  appointmentId: number,
) {
  return request<AppointmentDeposit>(`/appointments/${appointmentId}/deposit/`);
}

export function startAppointmentDepositCheckout(
  request: AuthenticatedRequest,
  appointmentId: number,
) {
  return request<{ url: string }>(`/appointments/${appointmentId}/deposit/`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
