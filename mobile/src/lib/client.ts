/**
 * Thin stateful client over the pure api-core builders. Token lives in memory
 * for v1 (sign in again after app restart); secure persistent sessions come
 * with the store release.
 */
import {
  buildApiRequest,
  buildSignInRequest,
  errorMessage,
  newIdempotencyKey,
  parseSignInResponse,
  uploadHeaders,
  type Session,
} from "./api-core";
import { config } from "../config";

let session: Session | null = null;

export function signedIn(): boolean {
  return session !== null && session.expiresAt > Date.now();
}

export function signOut(): void {
  session = null;
}

export async function signIn(email: string, password: string): Promise<void> {
  const spec = buildSignInRequest(
    config.supabaseUrl,
    config.supabaseAnonKey,
    email,
    password,
  );
  const response = await fetch(spec.url, spec.init);
  session = parseSignInResponse(
    response.status,
    await response.json().catch(() => ({})),
  );
}

export async function apiGet<T>(path: string): Promise<T> {
  if (!session) throw new Error("Signed out.");
  const spec = buildApiRequest(config.appUrl, session.accessToken, path);
  const response = await fetch(spec.url, spec.init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errorMessage(body, "Request failed."));
  return body as T;
}

export interface CapturedPhoto {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}

export async function uploadInvoice(
  photo: CapturedPhoto,
): Promise<{ invoiceId: string }> {
  if (!session) throw new Error("Signed out.");
  const form = new FormData();
  // React Native's FormData file part shape.
  form.append("file", {
    uri: photo.uri,
    name: photo.fileName ?? "invoice.jpg",
    type: photo.mimeType ?? "image/jpeg",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RN FormData file part isn't in DOM types.
  } as any);

  const response = await fetch(`${config.appUrl}/api/v1/invoices`, {
    method: "POST",
    headers: uploadHeaders(session.accessToken, newIdempotencyKey()),
    body: form,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errorMessage(body, "Upload failed."));
  return body as { invoiceId: string };
}
