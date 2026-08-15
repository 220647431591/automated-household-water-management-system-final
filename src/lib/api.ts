// Centralized API client for the Vercel-hosted backend (api/*.ts).
//
// By default this calls same-origin /api/* routes — which is how the app
// is meant to run once the frontend and API are deployed together on
// Vercel (see the deployment guide), so no configuration is needed there.
//
// Set VITE_API_BASE_URL only if the API is hosted on a different origin
// than the frontend (e.g. local development with separate dev servers).
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") || "/api";

function url(endpoint: string) {
  return `${API_BASE_URL}/${endpoint.replace(/^\//, "")}`;
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Backend did not return JSON (status ${res.status}). Response: ${text.slice(0, 200)}`);
  }
}

/**
 * POST a JSON body and parse the JSON response.
 * (Named postJson — the PHP backend's equivalent, postForm, sent
 * application/x-www-form-urlencoded; the new API accepts JSON bodies.)
 */
export async function postJson<T = unknown>(
  endpoint: string,
  fields: Record<string, string | number>,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(url(endpoint), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: JSON.stringify(fields),
    credentials: "include",
    signal,
  });
  return parse<T>(res);
}

/** GET JSON with optional query params. */
export async function getJson<T = unknown>(
  endpoint: string,
  params: Record<string, string | number | undefined> = {},
  signal?: AbortSignal,
): Promise<T> {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  const res = await fetch(qs ? `${url(endpoint)}?${qs}` : url(endpoint), {
    method: "GET",
    credentials: "include",
    signal,
  });
  return parse<T>(res);
}

/** Download a file from an endpoint (uses browser navigation, honors the API's Content-Disposition). */
export function downloadUrl(endpoint: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  return qs ? `${url(endpoint)}?${qs}` : url(endpoint);
}
