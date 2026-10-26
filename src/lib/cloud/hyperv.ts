import { createServerFn } from "@tanstack/react-start";

const ACTIONS = ["probe", "stop", "restart", "shutdown", "deploy", "owner"] as const;

function validIp(value: string) {
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) return false;
  return value.split(".").every((part) => Number(part) <= 255);
}

export const hypervAction = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const body = input as { action?: string; name?: string; computer?: string; memoryMb?: number; role?: string };
    if (!body || !ACTIONS.includes(body.action as (typeof ACTIONS)[number]) || body.action === "owner") throw new Error("Unknown action");
    if (body.action === "deploy" && body.role !== "vendor") throw new Error("Only vendor access can deploy instances.");
    return {
      action: body.action as "probe" | "stop" | "restart" | "shutdown" | "deploy",
      name: typeof body.name === "string" ? body.name : "",
      computer: typeof body.computer === "string" ? body.computer : "",
      memoryMb: typeof body.memoryMb === "number" ? body.memoryMb : 2048,
    };
  })
  .handler(async ({ data }) => {
    const { runHyperv } = await import("./hyperv.server");
    return runHyperv(data);
  });

export const observeOwner = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const body = input as { ip?: string; computer?: string };
    const ip = typeof body?.ip === "string" ? body.ip.trim() : "";
    const computer = typeof body?.computer === "string" ? body.computer.trim() : "";
    if (!validIp(ip)) throw new Error("Service IP is not valid.");
    if (computer && !/^[A-Za-z0-9][A-Za-z0-9.-]{0,253}$/.test(computer)) throw new Error("Hyper-V host name is not valid.");
    return { ip, computer };
  })
  .handler(async ({ data }) => {
    const { runHyperv } = await import("./hyperv.server");
    return runHyperv({ action: "owner", ip: data.ip, computer: data.computer });
  });
