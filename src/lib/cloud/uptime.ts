import type { ComputeService, WorkloadApp, WorkloadDatabase } from "@/lib/cloud/model";

export type SampleKind = "service" | "app" | "database";

export type WorkloadSample = {
  id: string;
  kind: SampleKind;
  target: string;
  hour: string;
  up: 0 | 1;
  performance: number;
  source: string;
  detail: string;
};

export type ChartPoint = {
  hour: string;
  up: number | null;
  performance: number | null;
  detail: string;
};

function hourKey(date: Date) {
  return date.toISOString().slice(0, 13);
}

export function currentHour(now = new Date()) {
  return hourKey(now);
}

export function lastHours(now = new Date()) {
  const start = new Date(now);
  start.setUTCMinutes(0, 0, 0);
  const keys: string[] = [];
  for (let i = 23; i >= 0; i -= 1) keys.push(hourKey(new Date(start.getTime() - i * 60 * 60 * 1000)));
  return keys;
}

export function hourLabel(hour: string) {
  return new Date(`${hour}:00:00Z`).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function sampleId(kind: SampleKind, target: string, hour: string) {
  return `${kind}:${target}:${hour}`;
}

export function rollup(points: Array<{ up: number; performance: number }>) {
  if (points.length === 0) return { availability: -1, performance: -1, checks: 0 };
  const availability = (points.filter((point) => point.up === 1).length / points.length) * 100;
  const perf = points.filter((point) => point.up === 1 && point.performance >= 0).map((point) => point.performance);
  return {
    availability,
    performance: perf.length ? perf.reduce((sum, value) => sum + value, 0) / perf.length : -1,
    checks: points.length,
  };
}

function gap(hour: string): ChartPoint {
  return { hour, up: null, performance: null, detail: "" };
}

export function chartPoints(input: {
  kind: SampleKind;
  target: string;
  samples: WorkloadSample[];
  apps: WorkloadApp[];
  databases: WorkloadDatabase[];
  now?: Date;
}): ChartPoint[] {
  const hours = lastHours(input.now);
  const live = input.samples.filter((row) => row.source);
  if (input.kind !== "service") {
    return hours.map((hour) => {
      const row = live.find((item) => item.kind === input.kind && item.target === input.target && item.hour === hour);
      if (!row) return gap(hour);
      return { hour, up: row.up, performance: row.performance < 0 ? null : row.performance, detail: row.detail };
    });
  }
  const databases = input.databases.filter((item) => item.serviceName === input.target);
  const apps = input.apps.filter((item) => item.serviceName === input.target);
  return hours.map((hour) => {
    const dbRows = databases.map((item) => live.find((row) => row.kind === "database" && row.target === item.name && row.hour === hour));
    const appRows = apps.map((item) => live.find((row) => row.kind === "app" && row.target === item.name && row.hour === hour));
    if (databases.length > 0 && dbRows.some((row) => !row)) return gap(hour);
    const rows = [...dbRows, ...appRows].filter((row): row is WorkloadSample => !!row);
    if (rows.length === 0) return gap(hour);
    const measured = rows.filter((row) => row.performance >= 0);
    const weakest = measured.reduce<WorkloadSample | null>((best, row) => (!best || row.performance < best.performance ? row : best), null);
    return {
      hour,
      up: rows.every((row) => row.up === 1) ? 1 : 0,
      performance: weakest ? weakest.performance : null,
      detail: weakest ? `${weakest.target}: ${weakest.detail}` : rows.map((row) => row.detail).filter(Boolean).join(" "),
    };
  });
}

export function refreshServices(input: {
  services: ComputeService[];
  apps: WorkloadApp[];
  databases: WorkloadDatabase[];
  samples: WorkloadSample[];
  now?: Date;
}): { samples: WorkloadSample[]; services: ComputeService[] } {
  const hours = new Set(lastHours(input.now));
  const samples = input.samples.filter((row) => row.source && hours.has(row.hour));
  const services = input.services.map((service) => {
    const points = chartPoints({
      kind: "service",
      target: service.name,
      samples,
      apps: input.apps,
      databases: input.databases,
      now: input.now,
    }).filter((point) => point.up !== null);
    const score = rollup(points.map((point) => ({ up: point.up === 1 ? 1 : 0, performance: point.performance ?? -1 })));
    return {
      ...service,
      availability: score.availability < 0 ? -1 : Math.round(score.availability * 100) / 100,
      performance: score.performance < 0 ? -1 : Math.round(score.performance),
    };
  });
  return { samples, services };
}
