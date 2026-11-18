import axios, { AxiosError, type AxiosRequestConfig } from 'axios';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

// The CSRF token lives only in memory; the session cookie is HTTP-only and never readable here.
let csrfToken: string | null = null;
export const setCsrfToken = (t: string | null) => {
  csrfToken = t;
};

// Called when a request that needed a session gets 401 (never for the /auth endpoints, where 401 is an expected answer).
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api/v1',
  withCredentials: true,
  timeout: 20_000,
});

client.interceptors.request.use((config) => {
  const method = (config.method ?? 'get').toLowerCase();
  if (csrfToken && method !== 'get' && method !== 'head') config.headers.set('X-CSRF-Token', csrfToken);
  return config;
});

client.interceptors.response.use(
  (r) => r,
  (err: unknown) => {
    if (err instanceof AxiosError && err.response?.status === 401 && !(err.config?.url ?? '').startsWith('/auth/'))
      onUnauthorized?.();
    return Promise.reject(err);
  },
);

function toApiError(err: unknown): ApiError {
  if (err instanceof AxiosError) {
    const e = err.response?.data?.error;
    if (e)
      return new ApiError(err.response!.status, e.code ?? 'ERROR', e.message ?? 'Something went wrong.', e.details);
    if (err.code === 'ECONNABORTED') return new ApiError(0, 'TIMEOUT', 'The request took too long. Please try again.');
    if (!err.response) return new ApiError(0, 'NETWORK', 'We could not reach the server. Check your connection.');
    return new ApiError(err.response.status, 'ERROR', 'Something went wrong.');
  }
  return new ApiError(0, 'ERROR', 'Something went wrong.');
}

async function request<T>(config: AxiosRequestConfig): Promise<T> {
  try {
    return (await client.request<{ success: true; data: T }>(config)).data.data;
  } catch (err) {
    throw toApiError(err);
  }
}

export const api = {
  get: <T>(url: string, params?: object, signal?: AbortSignal) => request<T>({ method: 'GET', url, params, signal }),
  post: <T>(url: string, data?: unknown, headers?: Record<string, string>) =>
    request<T>({ method: 'POST', url, data, headers }),
  put: <T>(url: string, data?: unknown) => request<T>({ method: 'PUT', url, data }),
  patch: <T>(url: string, data?: unknown) => request<T>({ method: 'PATCH', url, data }),
  del: <T>(url: string) => request<T>({ method: 'DELETE', url }),
};
