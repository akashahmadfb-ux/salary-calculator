import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';

let _client: AxiosInstance | null = null;

export function createApiClient(baseURL: string, getToken: () => Promise<string | null>): AxiosInstance {
  const client = axios.create({ baseURL, timeout: 30_000 });

  // Attach Bearer token to every request
  client.interceptors.request.use(async (config) => {
    const token = await getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  // Normalise error responses
  client.interceptors.response.use(
    (res) => res,
    (err) => {
      const message =
        err.response?.data?.message ?? err.message ?? 'An unexpected error occurred';
      return Promise.reject(new Error(message));
    },
  );

  _client = client;
  return client;
}

export function getApiClient(): AxiosInstance {
  if (!_client) {
    throw new Error('API client has not been initialised. Call createApiClient first.');
  }
  return _client;
}

export async function apiGet<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await getApiClient().get<T>(path, config);
  return res.data;
}

export async function apiPost<T, B = unknown>(path: string, body: B, config?: AxiosRequestConfig): Promise<T> {
  const res = await getApiClient().post<T>(path, body, config);
  return res.data;
}

export async function apiPatch<T, B = unknown>(path: string, body: B, config?: AxiosRequestConfig): Promise<T> {
  const res = await getApiClient().patch<T>(path, body, config);
  return res.data;
}

export async function apiDelete<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await getApiClient().delete<T>(path, config);
  return res.data;
}
