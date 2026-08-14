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

  const fieldError = Object.values(error.body).find(Array.isArray);
  if (Array.isArray(fieldError) && typeof fieldError[0] === 'string') {
    return fieldError[0];
  }
  return error.body.detail ?? t('genericError');
}
