import { useEffect, useState } from "react";
import { createServerFn } from "@tanstack/react-start";
import type { ConsolePayload } from "@/lib/cloud/persist.server";
import { useDr } from "@/lib/cloud/dr";
import { useCloud } from "@/lib/cloud/store";

const CLOUD_KEYS = [
  "role",
  "site",
  "instances",
  "inventory",
  "repositories",
  "subscriptions",
  "activity",
  "ports",
  "alerts",
  "events",
  "snmp",
  "appSubnet",
  "appAddress",
  "extraSubnets",
  "pollTick",
  "lastPollAt",
] as const;

const DR_KEYS = [
  "services",
  "hosts",
  "vms",
  "clusters",
  "apps",
  "databases",
  "workflows",
  "performance",
  "events",
  "alerts",
  "audit",
] as const;

export const loadConsole = createServerFn({ method: "GET" }).handler(async () => {
  const { readConsole } = await import("./persist.server");
  const payload = await readConsole();
  return payload ? JSON.stringify(payload) : "";
});

export const saveConsole = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!input || typeof input !== "object" || typeof (input as { body?: unknown }).body !== "string") {
      throw new Error("Invalid console state");
    }
    const body = (input as { body: string }).body;
    if (body.length > 2_000_000) throw new Error("Console state is too large");
    const parsed = JSON.parse(body) as Partial<ConsolePayload>;
    if (parsed.v !== 1 || !parsed.cloud || !parsed.dr) throw new Error("Invalid console state");
    return { body };
  })
  .handler(async ({ data }) => {
    const { writeConsole } = await import("./persist.server");
    await writeConsole(JSON.parse(data.body) as ConsolePayload);
    return { ok: true as const };
  });

function pick<T extends object, K extends keyof T>(state: T, keys: readonly K[]) {
  const out = {} as Pick<T, K>;
  for (const key of keys) out[key] = state[key];
  return out;
}

function snapshot(): ConsolePayload {
  return {
    v: 1,
    cloud: pick(useCloud.getState(), CLOUD_KEYS) as ConsolePayload["cloud"],
    dr: pick(useDr.getState(), DR_KEYS) as ConsolePayload["dr"],
  };
}

function apply(payload: ConsolePayload) {
  useCloud.setState(payload.cloud as object);
  useDr.setState(payload.dr as object);
}

export function useConsolePersistence() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stop = false;
    const unsubs: Array<() => void> = [];
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void saveConsole({ data: { body: JSON.stringify(snapshot()) } }).catch(() => undefined);
      }, 400);
    };

    void loadConsole()
      .then((raw) => {
        if (stop) return;
        if (raw) apply(JSON.parse(raw) as ConsolePayload);
        else schedule();
      })
      .catch(() => undefined)
      .finally(() => {
        if (stop) return;
        unsubs.push(useCloud.subscribe(schedule), useDr.subscribe(schedule));
        setReady(true);
      });

    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
      unsubs.forEach((unsub) => unsub());
    };
  }, []);

  return ready;
}
