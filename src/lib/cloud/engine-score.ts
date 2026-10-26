// Headroom from engine counters. 100 means every counter we received is inside
// its band. It is not query latency and not virtual-machine CPU.

export type EngineName = "mssql" | "mysql" | "mongodb" | "postgresql";

export type EngineStatus = "Healthy" | "Pressured" | "Critical" | "Not measured";

export type EngineCounter = { label: string; value: string };

export type EngineScore = {
  performance: number;
  status: EngineStatus;
  detail: string;
  counters: EngineCounter[];
};

export function defaultPort(engine: string) {
  if (engine === "mssql") return 1433;
  if (engine === "mysql") return 3306;
  if (engine === "mongodb") return 27017;
  if (engine === "postgresql") return 5432;
  return 0;
}

export function engineSupported(engine: string): engine is EngineName {
  return engine === "mssql" || engine === "mysql" || engine === "mongodb" || engine === "postgresql";
}

export function engineReading(engine: string) {
  if (engine === "mssql") return "SQL CPU, buffer-cache hit ratio, page life expectancy, blocked sessions, and the Always On redo queue when that instance is in an availability group.";
  if (engine === "mysql") return "InnoDB buffer-pool hit ratio, threads running, connection use, and replica lag.";
  if (engine === "mongodb") return "WiredTiger cache, lock queue, connections, replica-set lag, and average read latency when the server reports it.";
  if (engine === "postgresql") return "Cache hit ratio, sessions waiting on locks, active queries, and replica lag.";
  return "This engine has no reader. Nothing is invented for it.";
}

export function statusFrom(performance: number): EngineStatus {
  if (performance < 0) return "Not measured";
  if (performance >= 80) return "Healthy";
  if (performance >= 50) return "Pressured";
  return "Critical";
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function finish(counters: EngineCounter[], penalties: number[]): EngineScore {
  const detail = counters.map((counter) => `${counter.label} ${counter.value}`).join(" · ");
  if (penalties.length === 0) {
    return { performance: -1, status: "Not measured", detail: detail || "Connected, but no counters were returned.", counters };
  }
  const performance = clamp(100 - penalties.reduce((sum, value) => sum + value, 0));
  return { performance, status: statusFrom(performance), detail, counters };
}

function pct(value: number | null, digits = 0) {
  if (value == null || Number.isNaN(value)) return null;
  return `${value.toFixed(digits)}%`;
}

function seconds(value: number | null) {
  if (value == null || Number.isNaN(value)) return null;
  return `${Math.round(value)} s`;
}

function count(value: number | null) {
  if (value == null || Number.isNaN(value)) return null;
  return String(Math.round(value));
}

export function scoreMssql(input: {
  sqlCpu: number | null;
  bufferHit: number | null;
  pageLifeSec: number | null;
  blocked: number | null;
  agUnhealthy: boolean | null;
  redoMb: number | null;
}): EngineScore {
  const counters: EngineCounter[] = [];
  const penalties: number[] = [];
  const cpu = pct(input.sqlCpu);
  if (cpu && input.sqlCpu != null) {
    counters.push({ label: "SQL CPU", value: cpu });
    penalties.push(Math.max(0, input.sqlCpu - 70) * 1.5);
  }
  const hit = pct(input.bufferHit, 1);
  if (hit && input.bufferHit != null) {
    counters.push({ label: "buffer cache", value: hit });
    penalties.push(Math.max(0, 98 - input.bufferHit) * 2);
  }
  const ple = seconds(input.pageLifeSec);
  if (ple && input.pageLifeSec != null) {
    counters.push({ label: "page life", value: ple });
    penalties.push(input.pageLifeSec < 300 ? Math.min(25, (300 - input.pageLifeSec) / 12) : 0);
  }
  const blocked = count(input.blocked);
  if (blocked && input.blocked != null) {
    counters.push({ label: "blocked", value: blocked });
    penalties.push(Math.min(40, input.blocked * 15));
  }
  if (input.agUnhealthy != null) {
    counters.push({ label: "availability group", value: input.agUnhealthy ? "unhealthy" : "healthy" });
    penalties.push(input.agUnhealthy ? 25 : 0);
  }
  if (input.redoMb != null) {
    counters.push({ label: "redo queue", value: `${Math.round(input.redoMb)} MB` });
    penalties.push(input.redoMb > 100 ? 15 : 0);
  }
  return finish(counters, penalties);
}

export function scoreMysql(input: {
  bufferHit: number | null;
  threadsRunning: number | null;
  connectionPct: number | null;
  replicaLagSec: number | null;
  replicaUnknown?: boolean;
}): EngineScore {
  const counters: EngineCounter[] = [];
  const penalties: number[] = [];
  const hit = pct(input.bufferHit, 1);
  if (hit && input.bufferHit != null) {
    counters.push({ label: "buffer pool", value: hit });
    penalties.push(Math.max(0, 99 - input.bufferHit) * 3);
  }
  const running = count(input.threadsRunning);
  if (running && input.threadsRunning != null) {
    counters.push({ label: "threads running", value: running });
    penalties.push(input.threadsRunning > 16 ? Math.min(30, (input.threadsRunning - 16) * 2) : 0);
  }
  const connections = pct(input.connectionPct);
  if (connections && input.connectionPct != null) {
    counters.push({ label: "connections", value: connections });
    penalties.push(input.connectionPct > 80 ? (input.connectionPct - 80) * 1.5 : 0);
  }
  if (input.replicaUnknown) {
    counters.push({ label: "replica lag", value: "unknown" });
    penalties.push(20);
  } else {
    const lag = seconds(input.replicaLagSec);
    if (lag && input.replicaLagSec != null) {
      counters.push({ label: "replica lag", value: lag });
      penalties.push(Math.min(40, Math.max(0, input.replicaLagSec)));
    }
  }
  return finish(counters, penalties);
}

export function scoreMongo(input: {
  cachePct: number | null;
  queue: number | null;
  connectionPct: number | null;
  replicaLagSec: number | null;
  readLatencyMs: number | null;
}): EngineScore {
  const counters: EngineCounter[] = [];
  const penalties: number[] = [];
  const cache = pct(input.cachePct);
  if (cache && input.cachePct != null) {
    counters.push({ label: "cache", value: cache });
    penalties.push(input.cachePct > 80 ? (input.cachePct - 80) * 1.5 : 0);
  }
  const queue = count(input.queue);
  if (queue && input.queue != null) {
    counters.push({ label: "lock queue", value: queue });
    penalties.push(Math.min(30, input.queue * 10));
  }
  const connections = pct(input.connectionPct);
  if (connections && input.connectionPct != null) {
    counters.push({ label: "connections", value: connections });
    penalties.push(input.connectionPct > 80 ? (input.connectionPct - 80) * 1.5 : 0);
  }
  const lag = seconds(input.replicaLagSec);
  if (lag && input.replicaLagSec != null) {
    counters.push({ label: "replica lag", value: lag });
    penalties.push(Math.min(40, Math.max(0, input.replicaLagSec)));
  }
  if (input.readLatencyMs != null && !Number.isNaN(input.readLatencyMs)) {
    counters.push({ label: "avg read", value: `${Math.round(input.readLatencyMs)} ms` });
    penalties.push(input.readLatencyMs > 50 ? Math.min(30, (input.readLatencyMs - 50) / 5) : 0);
  }
  return finish(counters, penalties);
}

export function scorePostgres(input: {
  cacheHit: number | null;
  waitingLocks: number | null;
  active: number | null;
  replicaLagSec: number | null;
}): EngineScore {
  const counters: EngineCounter[] = [];
  const penalties: number[] = [];
  const hit = pct(input.cacheHit, 1);
  if (hit && input.cacheHit != null) {
    counters.push({ label: "cache hit", value: hit });
    penalties.push(Math.max(0, 99 - input.cacheHit) * 3);
  }
  const waiting = count(input.waitingLocks);
  if (waiting && input.waitingLocks != null) {
    counters.push({ label: "lock waits", value: waiting });
    penalties.push(Math.min(40, input.waitingLocks * 15));
  }
  const active = count(input.active);
  if (active && input.active != null) {
    counters.push({ label: "active queries", value: active });
    penalties.push(input.active > 32 ? Math.min(20, input.active - 32) : 0);
  }
  const lag = seconds(input.replicaLagSec);
  if (lag && input.replicaLagSec != null) {
    counters.push({ label: "replica lag", value: lag });
    penalties.push(Math.min(40, Math.max(0, input.replicaLagSec)));
  }
  return finish(counters, penalties);
}
