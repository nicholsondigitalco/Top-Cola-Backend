type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string | null
  ) {}

  async request<T>(path: string, method: HttpMethod = "GET", body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });

    if (response.status === 204) {
      return undefined as T;
    }

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? "Request failed");
    }
    return payload as T;
  }

  async requestFormData<T>(path: string, method: HttpMethod, body: FormData): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
      },
      body
    });

    if (response.status === 204) {
      return undefined as T;
    }

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? "Request failed");
    }
    return payload as T;
  }
}
