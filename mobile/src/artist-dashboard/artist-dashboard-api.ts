import type {
  ArtistBlockedPeriod,
  ArtistBookingPreferences,
  ArtistBookingPreferencesUpdate,
  ArtistBookingStatus,
  ArtistDashboard,
  ArtistDashboardSettings,
  ArtistScheduleDay,
  ArtistTimeOff,
} from '@/api/types';
import type { AuthenticatedRequest } from '@/auth/auth-context';


export function fetchArtistDashboard(request: AuthenticatedRequest) {
  return request<ArtistDashboard>('/artist/dashboard/');
}

export function updateArtistBookingStatus(
  request: AuthenticatedRequest,
  bookingStatus: ArtistBookingStatus,
) {
  return request<ArtistDashboardSettings>('/artist/dashboard/', {
    method: 'PATCH',
    body: JSON.stringify({ booking_status: bookingStatus }),
  });
}

export function fetchArtistBookingPreferences(request: AuthenticatedRequest) {
  return request<ArtistBookingPreferences>('/artist/dashboard/preferences/');
}

export function saveArtistBookingPreferences(
  request: AuthenticatedRequest,
  payload: ArtistBookingPreferencesUpdate,
) {
  return request<ArtistBookingPreferences>('/artist/dashboard/preferences/', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function saveArtistSchedule(
  request: AuthenticatedRequest,
  days: ArtistScheduleDay[],
) {
  return request<{ schedule: ArtistScheduleDay[] }>('/artist/dashboard/schedule/', {
    method: 'PUT',
    body: JSON.stringify({ days }),
  });
}

export function createArtistTimeOff(
  request: AuthenticatedRequest,
  date: string,
  reason: string,
) {
  return request<ArtistTimeOff>('/artist/dashboard/time-off/', {
    method: 'POST',
    body: JSON.stringify({ date, reason }),
  });
}

export function deleteArtistTimeOff(
  request: AuthenticatedRequest,
  timeOffId: number,
) {
  return request<void>(`/artist/dashboard/time-off/${timeOffId}/`, {
    method: 'DELETE',
  });
}

export function createArtistBlock(
  request: AuthenticatedRequest,
  payload: { date: string; startTime: string; endTime: string; reason: string },
) {
  return request<ArtistBlockedPeriod>('/artist/dashboard/blocks/', {
    method: 'POST',
    body: JSON.stringify({
      date: payload.date,
      start_time: payload.startTime,
      end_time: payload.endTime,
      reason: payload.reason,
    }),
  });
}

export function deleteArtistBlock(
  request: AuthenticatedRequest,
  eventId: number,
) {
  return request<void>(`/artist/dashboard/blocks/${eventId}/`, {
    method: 'DELETE',
  });
}
