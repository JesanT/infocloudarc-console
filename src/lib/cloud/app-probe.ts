import { createServerFn } from "@tanstack/react-start";

function hostOk(value: string) {
  if (value.length < 1 || value.length > 253) return false;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) return value.split(".").every((part) => Number(part) <= 255);
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/.test(value);
}

function pathOk(value: string) {
  return value.startsWith("/") && value.length <= 200 && !value.includes("://") && !/[\s\\]/.test(value);
}

export const readApplication = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const body = input as { host?: unknown; port?: unknown; path?: unknown; https?: unknown; user?: unknown; password?: unknown };
    const host = typeof body?.host === "string" ? body.host.trim() : "";
    const port = typeof body?.port === "number" ? body.port : Number(body?.port);
    const path = typeof body?.path === "string" && body.path.trim() ? body.path.trim() : "/";
    const user = typeof body?.user === "string" ? body.user.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!hostOk(host)) throw new Error("Address is not valid.");
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Port is not valid.");
    if (!pathOk(path)) throw new Error("Path is not valid.");
    if (user && !/^[A-Za-z0-9._@\\-]{1,128}$/.test(user)) throw new Error("Login is not valid.");
    if (password.length > 200) throw new Error("Password is too long.");
    return { host, port, path, https: body?.https === true, user, password };
  })
  .handler(async ({ data }) => {
    const { readApplicationPage } = await import("./app-probe.server");
    return readApplicationPage(data);
  });
