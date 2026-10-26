import { createServerFn } from "@tanstack/react-start";

const ACTIONS = ["probe", "stop", "restart", "shutdown", "deploy"] as const;

export const hypervAction = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const body = input as { action?: string; name?: string; computer?: string; memoryMb?: number; role?: string };
    if (!body || !ACTIONS.includes(body.action as (typeof ACTIONS)[number])) throw new Error("Unknown action");
    if (body.action === "deploy" && body.role !== "vendor") throw new Error("Only vendor access can deploy instances.");
    return {
      action: body.action as (typeof ACTIONS)[number],
      name: typeof body.name === "string" ? body.name : "",
      computer: typeof body.computer === "string" ? body.computer : "",
      memoryMb: typeof body.memoryMb === "number" ? body.memoryMb : 2048,
    };
  })
  .handler(async ({ data }) => {
    const { runHyperv } = await import("./hyperv.server");
    return runHyperv(data);
  });
