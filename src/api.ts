// One place for talking to the API, so every screen handles an expired
// session and a server error the same way.

export class ApiError extends Error {
  status: number;
  /** The error response's JSON, for screens that need more than the message. */
  body?: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export const SIGNED_OUT_EVENT = "poseidon:signed-out";

async function handle<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    // The cookie is gone or expired — tell AuthContext so the app falls
    // back to the login screen instead of rendering half-broken pages.
    window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
    throw new ApiError("Your session has expired. Please sign in again.", 401);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(body?.error ?? "Request failed", response.status, body ?? undefined);
  }

  const body = await response.json().catch(() => null);
  if (body === null) {
    throw new ApiError(
      "No response from the server. Check that the API is running.",
      response.status,
    );
  }
  return body as T;
}

/** GET a JSON endpoint. Throws ApiError on anything other than 2xx. */
export function apiGet<T>(url: string): Promise<T> {
  return fetch(url).then((r) => handle<T>(r));
}

/** PUT JSON to an endpoint. Throws ApiError on anything other than 2xx. */
export function apiPut<T>(url: string, body: unknown): Promise<T> {
  return fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => handle<T>(r));
}

/** POST a file (multipart) with extra fields. Throws ApiError on anything other than 2xx. */
export function apiUpload<T>(url: string, file: File, fields: Record<string, string> = {}): Promise<T> {
  const body = new FormData();
  body.append("file", file);
  for (const [k, v] of Object.entries(fields)) body.append(k, v);
  return fetch(url, { method: "POST", body }).then((r) => handle<T>(r));
}

/** DELETE an endpoint. Throws ApiError on anything other than 2xx. */
export function apiDelete<T>(url: string): Promise<T> {
  return fetch(url, { method: "DELETE" }).then((r) => handle<T>(r));
}

/** POST JSON to an endpoint. Throws ApiError on anything other than 2xx. */
export function apiPost<T>(url: string, body: unknown): Promise<T> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => handle<T>(r));
}
