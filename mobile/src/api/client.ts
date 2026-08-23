import Constants from 'expo-constants';

import { appLanguage } from '@/i18n';


type ErrorBody = {
  code?: string;
  detail?: string;
  [key: string]: unknown;
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ErrorBody,
  ) {
    super(body.detail ?? `Tatzo API request failed (${status})`);
    this.name = 'ApiError';
  }
}

const configuredBaseUrl = Constants.expoConfig?.extra?.apiBaseUrl;
export const API_BASE_URL = String(
  configuredBaseUrl ?? 'https://tatzo.eu/api/v1',
).replace(/\/$/, '');

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (init.body && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Accept', 'application/json');
  headers.set('Accept-Language', appLanguage);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json')
    ? ((await response.json()) as ErrorBody)
    : {};

  if (!response.ok) {
    throw new ApiError(response.status, body);
  }

  return body as T;
}
