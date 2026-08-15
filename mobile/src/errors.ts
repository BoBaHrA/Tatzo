import { ApiError } from '@/api/client';
import { t } from '@/i18n';


export function userFacingError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return t('genericError');
  }

  if (error.body.code === 'invalid_credentials') {
    return t('invalidCredentials');
  }
  if (error.body.code === 'email_not_verified') {
    return t('emailNotVerified');
  }
  if (error.body.code === 'rate_limited') {
    return t('rateLimited');
  }
  if (error.body.code === 'location_request_exists') {
    return t('mapLocationAlreadyPending');
  }
  if (error.body.code === 'claim_exists') {
    return t('mapClaimAlreadyPending');
  }
  if (error.body.code === 'artist_dashboard_forbidden') {
    return t('artistDashboardForbidden');
  }
  if (error.body.code === 'invalid_booking_status') {
    return t('artistInvalidStatus');
  }
  if (error.body.code === 'invalid_schedule') {
    return t('artistInvalidSchedule');
  }
  if (error.body.code === 'invalid_date') {
    return t('artistInvalidDate');
  }
  if (error.body.code === 'past_date') {
    return t('artistPastDate');
  }
  if (error.body.code === 'calendar_conflict') {
    return t('artistCalendarConflict');
  }
  if (error.body.code === 'invalid_block') {
    return t('artistInvalidBlock');
  }

  const fieldError = Object.values(error.body).find(Array.isArray);
  if (Array.isArray(fieldError) && typeof fieldError[0] === 'string') {
    return fieldError[0];
  }
  return error.body.detail ?? t('genericError');
}
