import http from "node:http";
import https from "node:https";
import { outcomeFromHttp, type AppHttpResult } from "@/lib/cloud/app-score";

export type AppRequest = {
  host: string;
  port: number;
  path: string;
  https: boolean;
  user: string;
  password: string;
};

function classify(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  const message = error instanceof Error ? error.message : "";
  const text = `${code} ${message}`.toLowerCase();
  if (text.includes("econnrefused")) return "refused";
  if (text.includes("timeout") || text.includes("etimedout")) return "timeout";
  return "unreachable";
}

function requestOnce(target: URL, headers: Record<string, string>) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const lib = target.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: "GET",
        headers,
        timeout: 8000,
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 262_144) {
            req.destroy();
            reject(Object.assign(new Error("response too large"), { code: "ETOOBIG" }));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    req.on("timeout", () => {
      req.destroy();
      reject(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }));
    });
    req.on("error", reject);
    req.end();
  });
}

export async function readApplicationPage(input: AppRequest): Promise<AppHttpResult> {
  let target: URL;
  try {
    target = new URL(`${input.https ? "https" : "http"}://${input.host}:${input.port}${input.path}`);
  } catch {
    return { ok: false, message: "Address is not valid." };
  }
  if (target.username || target.hostname !== input.host) return { ok: false, message: "Address is not valid." };
  const headers: Record<string, string> = { Accept: "application/xml, text/plain;q=0.9, */*;q=0.1" };
  if (input.user) headers.Authorization = `Basic ${Buffer.from(`${input.user}:${input.password}`, "utf8").toString("base64")}`;
  try {
    const response = await requestOnce(target, headers);
    return outcomeFromHttp(response.status, response.body);
  } catch (error) {
    const kind = classify(error);
    if (kind === "refused") {
      return { ok: true, up: 0, performance: -1, source: "application", detail: "The address refused the connection. Status counters were not read." };
    }
    if (kind === "timeout") {
      return { ok: false, message: "No response before the timeout. Nothing was stored, because a firewall can look the same as a stopped application." };
    }
    return { ok: false, message: "The address could not be reached. Nothing was stored." };
  }
}
