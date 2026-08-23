import type { ArtistVerification } from '@/api/types';
import type { AuthenticatedRequest } from '@/auth/auth-context';


export type PendingVerificationDocument = {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
};

export type VerificationDocumentsDraft = {
  businessDocumentType: string;
  businessDocument: PendingVerificationDocument;
  idDocumentType: string;
  idDocument: PendingVerificationDocument;
};

export type ManualVerificationDraft = {
  portfolioLink: string;
  socialLink: string;
  cityCountry: string;
  explanation: string;
  extraFile?: PendingVerificationDocument | null;
};

function documentBody(document: PendingVerificationDocument): Blob {
  return {
    uri: document.uri,
    name: document.name,
    type: document.mimeType || 'application/octet-stream',
  } as unknown as Blob;
}

export function fetchArtistVerification(
  request: AuthenticatedRequest,
): Promise<ArtistVerification> {
  return request<ArtistVerification>('/me/verification/');
}

export function submitVerificationDocuments(
  request: AuthenticatedRequest,
  draft: VerificationDocumentsDraft,
): Promise<ArtistVerification> {
  const body = new FormData();
  body.append('business_document_type', draft.businessDocumentType);
  body.append('business_document_file', documentBody(draft.businessDocument));
  body.append('id_document_type', draft.idDocumentType);
  body.append('id_document_file', documentBody(draft.idDocument));
  return request<ArtistVerification>('/me/verification/documents/', {
    method: 'POST',
    body,
  });
}

export function submitManualVerification(
  request: AuthenticatedRequest,
  draft: ManualVerificationDraft,
): Promise<ArtistVerification> {
  const body = new FormData();
  body.append('portfolio_link', draft.portfolioLink);
  body.append('social_link', draft.socialLink);
  body.append('city_country', draft.cityCountry);
  body.append('explanation', draft.explanation);
  if (draft.extraFile) {
    body.append('extra_file', documentBody(draft.extraFile));
  }
  return request<ArtistVerification>('/me/verification/manual/', {
    method: 'POST',
    body,
  });
}
