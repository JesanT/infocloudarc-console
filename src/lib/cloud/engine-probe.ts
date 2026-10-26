import { createServerFn } from "@tanstack/react-start";
import { engineSupported } from "@/lib/cloud/engine-score";

function hostOk(value: string) {
  if (value.length < 1 || value.length > 253) return false;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) return value.split(".").every((part) => Number(part) <= 255);
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/.test(value);
}

function login(input: unknown) {
  const body = input as { host?: unknown; port?: unknown; user?: unknown; password?: unknown; database?: unknown };
  const host = typeof body?.host === "string" ? body.host.trim() : "";
  const port = typeof body?.port === "number" ? body.port : Number(body?.port);
  const user = typeof body?.user === "string" ? body.user.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const database = typeof body?.database === "string" ? body.database.trim() : "";
  if (!hostOk(host)) throw new Error("Address is not valid.");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Port is not valid.");
  if (!/^[A-Za-z0-9._@\\-]{1,128}$/.test(user)) throw new Error("Login is not valid.");
  if (password.length > 200) throw new Error("Password is too long.");
  if (database && !/^[A-Za-z0-9_-]{1,64}$/.test(database)) throw new Error("Database name is not valid.");
  return { host, port, user, password, database };
}

export const readEngine = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const body = input as { engine?: unknown };
    const engine = typeof body?.engine === "string" ? body.engine : "";
    if (!engineSupported(engine)) throw new Error("This engine has no reader.");
    return { engine, ...login(input) };
  })
  .handler(async ({ data }) => {
    const { readEngineCounters } = await import("./engine-probe.server");
    return readEngineCounters(data);
  });

export const readReachability = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const body = input as { host?: unknown; port?: unknown };
    const host = typeof body?.host === "string" ? body.host.trim() : "";
    const port = typeof body?.port === "number" ? body.port : Number(body?.port);
    if (!hostOk(host)) throw new Error("Address is not valid.");
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Port is not valid.");
    return { host, port };
  })
  .handler(async ({ data }) => {
    const { readPort } = await import("./engine-probe.server");
    return readPort(data.host, data.port);
  });
