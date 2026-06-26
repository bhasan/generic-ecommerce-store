import { logger } from '../../../../utils/logger';

export interface ForeverPosConfig {
  baseUrl: string;
  username: string;
  password: string;
  sakCatchAllProductId: number;
  sakCatchAllVariantId: number;
}

export class ForeverPosClient {
  private token: string | null = null;
  constructor(private readonly cfg: ForeverPosConfig) {}

  private async login(): Promise<string> {
    const res = await fetch(`${this.cfg.baseUrl}/api/Users/login-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', accept: '*/*' },
      body: JSON.stringify({ email: this.cfg.username, password: this.cfg.password }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error('ForeverPOS auth failed', new Error(`login ${res.status}`), { event: 'pos_auth_failed', status: res.status, body: text.slice(0, 200) });
      throw new Error(`ForeverPOS login failed: ${res.status}`);
    }
    const body = (await res.json()) as { accessToken?: string };
    if (!body.accessToken) {
      logger.error('ForeverPOS auth missing token', new Error('no accessToken'), { event: 'pos_auth_failed' });
      throw new Error('ForeverPOS login returned no accessToken');
    }
    this.token = body.accessToken;
    return this.token;
  }

  private async ensureToken(): Promise<string> {
    return this.token ?? (await this.login());
  }

  async request<T>(method: 'POST' | 'PUT', path: string, body: unknown): Promise<T> {
    let token = await this.ensureToken();
    let res = await this.send(method, path, body, token);
    if (res.status === 401) {
      this.token = null;
      token = await this.login();
      res = await this.send(method, path, body, token);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`ForeverPOS ${method} ${path} failed: ${res.status} ${text.slice(0, 200)}`);
    }
    // Some SAK endpoints return 204 with no body.
    const text = await res.text().catch(() => '');
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private send(method: string, path: string, body: unknown, token: string): Promise<Response> {
    return fetch(`${this.cfg.baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', accept: '*/*', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  }
}
