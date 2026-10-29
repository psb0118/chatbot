/**
 * Fetch mutator used by the generated API client.
 *
 * The browser talks to the same origin, so the Clerk session cookie is sent
 * with every request. Non-2xx responses are thrown as an Error with `status`
 * and `data` attached, which is what the UI reads to render admin errors.
 */

export interface ApiError extends Error {
  status: number;
  data?: unknown;
}

const readBody = async (response: Response): Promise<unknown> => {
  if (response.status === 204) {
    return undefined;
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }

  try {
    return await response.text();
  } catch {
    return undefined;
  }
};

const errorMessage = (response: Response, data: unknown): string => {
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    if (typeof record.error === 'string') {
      return record.error;
    }
    if (typeof record.message === 'string') {
      return record.message;
    }
  }

  if (typeof data === 'string' && data.trim().length > 0) {
    return data;
  }

  return `Request failed with status ${response.status}`;
};

export const customFetch = async <T>(
  url: string,
  options: RequestInit = {},
): Promise<T> => {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');

  if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers,
  });

  const data = await readBody(response);

  if (!response.ok) {
    const error = new Error(errorMessage(response, data)) as ApiError;
    error.name = 'ApiError';
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data as T;
};

export default customFetch;
