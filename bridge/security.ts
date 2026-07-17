import type { NextFunction, Request, Response } from "express";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface ApiRequestMetadata {
  host?: string;
  origin?: string;
  fetchSite?: string;
  method: string;
  contentType?: string;
  controlHeader?: string;
}

export interface ApiRejection {
  status: 403 | 415;
  error: string;
}

export function allowedOrigins(port: number, configured = process.env.FUN60_ALLOWED_ORIGINS): Set<string> {
  const origins = new Set([
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    "http://127.0.0.1:5173",
    "http://localhost:5173",
  ]);

  for (const entry of configured?.split(",") ?? []) {
    const value = entry.trim();
    if (!value) continue;
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error(`Invalid FUN60_ALLOWED_ORIGINS entry: ${value}`);
    }
    origins.add(parsed.origin);
  }
  return origins;
}

export function isLoopbackHost(value: string | undefined, port: number): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(`http://${value}`);
    return LOOPBACK_HOSTS.has(parsed.hostname) && parsed.port === String(port);
  } catch {
    return false;
  }
}

export function validateApiRequest(metadata: ApiRequestMetadata, port: number, origins: ReadonlySet<string>): ApiRejection | null {
  if (!isLoopbackHost(metadata.host, port)) {
    return { status: 403, error: "Untrusted API host." };
  }

  if (metadata.origin) {
    let normalized: string;
    try {
      normalized = new URL(metadata.origin).origin;
    } catch {
      return { status: 403, error: "Untrusted browser origin." };
    }
    if (!origins.has(normalized)) return { status: 403, error: "Untrusted browser origin." };
  } else if (metadata.fetchSite && !["same-origin", "none"].includes(metadata.fetchSite)) {
    return { status: 403, error: "Cross-site API request blocked." };
  }

  if (MUTATING_METHODS.has(metadata.method.toUpperCase())) {
    if (metadata.controlHeader !== "1") return { status: 403, error: "Missing local control header." };
    if (!metadata.contentType?.toLowerCase().startsWith("application/json")) {
      return { status: 415, error: "API writes require application/json." };
    }
  }
  return null;
}

export function apiSecurity(port: number, origins = allowedOrigins(port)) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const origin = request.get("origin");
    const rejection = validateApiRequest({
      host: request.get("host"),
      origin,
      fetchSite: request.get("sec-fetch-site"),
      method: request.method,
      contentType: request.get("content-type"),
      controlHeader: request.get("x-fun60-control"),
    }, port, origins);

    if (rejection) {
      response.status(rejection.status).json({ error: rejection.error });
      return;
    }

    if (origin) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-FUN60-Control");
      response.setHeader("Access-Control-Max-Age", "600");
      response.vary("Origin");
    }
    if (request.method === "OPTIONS") {
      response.sendStatus(204);
      return;
    }
    next();
  };
}
