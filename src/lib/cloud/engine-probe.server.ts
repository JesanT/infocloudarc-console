import net from "node:net";
import { scoreMongo, scoreMssql, scoreMysql, scorePostgres, type EngineName, type EngineScore } from "@/lib/cloud/engine-score";

export type EngineRequest = {
  engine: EngineName;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

export type ProbeOutcome =
  | { ok: true; up: 0 | 1; performance: number; source: string; detail: string }
  | { ok: false; message: string };

type Row = Record<string, unknown>;

function classify(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  const message = error instanceof Error ? error.message : "";
  const text = `${code} ${message}`.toLowerCase();
  if (text.includes("econnrefused")) return "refused";
  if (text.includes("timeout") || text.includes("etimedout")) return "timeout";
  if (
    text.includes("login") ||
    text.includes("authentication") ||
    text.includes("access denied") ||
    text.includes("password") ||
    text.includes("28p01") ||
    text.includes("18456") ||
    text.includes("auth failed")
  ) {
    return "login";
  }
  return "unreachable";
}

function refused(source: string): ProbeOutcome {
  return {
    ok: true,
    up: 0,
    performance: -1,
    source,
    detail: "The address refused the connection. Performance counters were not read.",
  };
}

function notStored(kind: string): ProbeOutcome {
  if (kind === "timeout") {
    return { ok: false, message: "No response before the timeout. Nothing was stored, because a firewall can look the same as a stopped engine." };
  }
  if (kind === "login") {
    return { ok: false, message: "The engine refused the login. Nothing was stored. A bad password is not downtime." };
  }
  return { ok: false, message: "The address could not be reached. Nothing was stored." };
}

function stored(source: string, score: EngineScore): ProbeOutcome {
  return { ok: true, up: 1, performance: score.performance, source, detail: score.detail };
}

function countersDenied(source: string): ProbeOutcome {
  return {
    ok: true,
    up: 1,
    performance: -1,
    source,
    detail: "Connected, but this login cannot read the performance counters.",
  };
}

function withTimeout<T>(work: Promise<T>, ms = 9000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })), ms);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

function num(value: unknown) {
  if (typeof value === "bigint") {
    const next = Number(value);
    return Number.isFinite(next) ? next : null;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const next = Number(value);
    return Number.isFinite(next) ? next : null;
  }
  return null;
}

function cell(row: Row, name: string) {
  const key = Object.keys(row).find((item) => item.toLowerCase() === name.toLowerCase());
  return key ? row[key] : undefined;
}

export function probeTcp(host: string, port: number): Promise<"open" | "refused" | "timeout" | "unreachable"> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve("timeout");
    }, 4000);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolve("open");
    });
    socket.once("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      socket.destroy();
      if (error.code === "ECONNREFUSED") resolve("refused");
      else if (error.code === "ETIMEDOUT") resolve("timeout");
      else resolve("unreachable");
    });
  });
}

export async function readPort(host: string, port: number): Promise<ProbeOutcome> {
  const result = await probeTcp(host, port);
  if (result === "open") {
    return { ok: true, up: 1, performance: -1, source: "port", detail: "The port accepted a connection. Response time was not measured." };
  }
  if (result === "refused") return refused("port");
  return notStored(result === "timeout" ? "timeout" : "unreachable");
}

async function mssqlRows(connection: import("tedious").Connection, Request: typeof import("tedious").Request, sqlText: string) {
  const rows: Row[] = [];
  await new Promise<void>((resolve, reject) => {
    const request = new Request(sqlText, (error) => (error ? reject(error) : resolve()));
    request.on("row", (columns) => {
      const row: Row = {};
      for (const column of columns) row[column.metadata.colName] = column.value;
      rows.push(row);
    });
    connection.execSql(request);
  });
  return rows;
}

async function readMssql(input: EngineRequest): Promise<ProbeOutcome> {
  const { Connection, Request } = await import("tedious");
  const connection = new Connection({
    server: input.host,
    authentication: { type: "default", options: { userName: input.user, password: input.password } },
    options: {
      port: input.port,
      database: input.database || "master",
      encrypt: true,
      trustServerCertificate: true,
      connectTimeout: 8000,
      requestTimeout: 8000,
    },
  });
  try {
    await withTimeout(new Promise<void>((resolve, reject) => {
      connection.once("connect", (error) => (error ? reject(error) : resolve()));
      connection.connect();
    }));
    try {
      const cpuRows = await mssqlRows(connection, Request, `
        select top (1)
          record_xml.value('(./Record/SchedulerMonitorEvent/SystemHealth/ProcessUtilization)[1]', 'int') as sql_cpu
        from (
          select top (1) convert(xml, record) as record_xml
          from sys.dm_os_ring_buffers
          where ring_buffer_type = N'RING_BUFFER_SCHEDULER_MONITOR'
            and record like N'%<SystemHealth>%'
          order by timestamp desc
        ) as latest
      `);
      const counters = await mssqlRows(connection, Request, `
        select rtrim(counter_name) as counter_name, cntr_value
        from sys.dm_os_performance_counters
        where rtrim(object_name) like N'%Buffer Manager'
          and rtrim(counter_name) in (N'Buffer cache hit ratio', N'Buffer cache hit ratio base', N'Page life expectancy')
      `);
      const blocked = await mssqlRows(connection, Request, `
        select count(*) as blocked
        from sys.dm_exec_requests
        where blocking_session_id > 0
      `);
      let agUnhealthy: boolean | null = null;
      let redoMb: number | null = null;
      try {
        const ag = await mssqlRows(connection, Request, `
          select synchronization_health, redo_queue_size
          from sys.dm_hadr_database_replica_states
          where is_local = 1
        `);
        if (ag.length > 0) {
          agUnhealthy = ag.some((row) => num(cell(row, "synchronization_health")) !== 2);
          const queues = ag.map((row) => num(cell(row, "redo_queue_size"))).filter((value): value is number => value != null);
          redoMb = queues.length ? Math.max(...queues) / 1024 : null;
        }
      } catch {
        agUnhealthy = null;
        redoMb = null;
      }
      const hit = sumNamed(counters, "Buffer cache hit ratio");
      const base = sumNamed(counters, "Buffer cache hit ratio base");
      const life = counters
        .filter((row) => String(cell(row, "counter_name") ?? "").trim() === "Page life expectancy")
        .map((row) => num(cell(row, "cntr_value")))
        .filter((value): value is number => value != null);
      return stored("mssql", scoreMssql({
        sqlCpu: num(cell(cpuRows[0] ?? {}, "sql_cpu")),
        bufferHit: hit != null && base ? (100 * hit) / base : null,
        pageLifeSec: life.length ? Math.min(...life) : null,
        blocked: num(cell(blocked[0] ?? {}, "blocked")),
        agUnhealthy,
        redoMb,
      }));
    } catch {
      return countersDenied("mssql");
    }
  } catch (error) {
    const kind = classify(error);
    return kind === "refused" ? refused("mssql") : notStored(kind);
  } finally {
    connection.close();
  }
}

function sumNamed(rows: Row[], name: string) {
  const values = rows
    .filter((row) => String(cell(row, "counter_name") ?? "").trim() === name)
    .map((row) => num(cell(row, "cntr_value")))
    .filter((value): value is number => value != null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

async function readMysql(input: EngineRequest): Promise<ProbeOutcome> {
  const mysql = await import("mysql2/promise");
  const connection = await mysql.createConnection({
    host: input.host,
    port: input.port,
    user: input.user,
    password: input.password,
    database: input.database || undefined,
    connectTimeout: 8000,
  });
  try {
    const [statusRows] = await connection.query(
      "show global status where variable_name in ('Innodb_buffer_pool_read_requests', 'Innodb_buffer_pool_reads', 'Threads_running', 'Threads_connected')",
    );
    const [variableRows] = await connection.query("show global variables where variable_name = 'max_connections'");
    const status = Object.fromEntries((statusRows as Row[]).map((row) => [String(cell(row, "Variable_name")), num(cell(row, "Value"))]));
    const max = num(cell((variableRows as Row[])[0] ?? {}, "Value"));
    const requests = status.Innodb_buffer_pool_read_requests;
    const reads = status.Innodb_buffer_pool_reads;
    let replicaLagSec: number | null = null;
    let replicaUnknown = false;
    const takeReplica = (row: Row | undefined, names: string[]) => {
      if (!row) return;
      const lag = names.map((name) => num(cell(row, name))).find((value) => value != null) ?? null;
      if (lag == null) replicaUnknown = true;
      else replicaLagSec = lag;
    };
    try {
      const [replica] = await connection.query("show replica status");
      takeReplica((replica as Row[])[0], ["Seconds_Behind_Source", "Seconds_Behind_Master"]);
    } catch {
      try {
        const [replica] = await connection.query("show slave status");
        takeReplica((replica as Row[])[0], ["Seconds_Behind_Master"]);
      } catch {
        replicaLagSec = null;
        replicaUnknown = false;
      }
    }
    const connected = status.Threads_connected;
    return stored("mysql", scoreMysql({
      bufferHit: requests && reads != null ? (1 - reads / requests) * 100 : null,
      threadsRunning: status.Threads_running ?? null,
      connectionPct: connected != null && max ? (connected / max) * 100 : null,
      replicaLagSec,
      replicaUnknown,
    }));
  } catch {
    return countersDenied("mysql");
  } finally {
    await connection.end();
  }
}

async function readMongo(input: EngineRequest): Promise<ProbeOutcome> {
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(`mongodb://${input.host}:${input.port}`, {
    auth: { username: input.user, password: input.password },
    authSource: input.database || "admin",
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
    directConnection: true,
  });
  try {
    await client.connect();
    try {
      const admin = client.db(input.database || "admin").admin();
    const status = await admin.command({ serverStatus: 1 }) as {
      opLatencies?: { reads?: { latency?: number; ops?: number } };
      wiredTiger?: { cache?: Record<string, number> };
      globalLock?: { currentQueue?: { readers?: number; writers?: number } };
      connections?: { current?: number; available?: number };
    };
    let replicaLagSec: number | null = null;
    try {
      const replica = await admin.command({ replSetGetStatus: 1 }) as {
        members?: Array<{ stateStr?: string; optimeDate?: Date }>;
      };
      const primary = replica.members?.find((member) => member.stateStr === "PRIMARY");
      const lags = (replica.members ?? [])
        .filter((member) => member.stateStr === "SECONDARY" && primary?.optimeDate && member.optimeDate)
        .map((member) => Math.max(0, (primary!.optimeDate!.getTime() - member.optimeDate!.getTime()) / 1000));
      replicaLagSec = lags.length ? Math.max(...lags) : primary ? 0 : null;
    } catch {
      replicaLagSec = null;
    }
    const cache = status.wiredTiger?.cache;
    const used = cache?.["bytes currently in the cache"];
    const max = cache?.["maximum bytes configured"];
    const reads = status.opLatencies?.reads;
    const current = status.connections?.current;
    const available = status.connections?.available;
    const readers = status.globalLock?.currentQueue?.readers;
    const writers = status.globalLock?.currentQueue?.writers;
    return stored("mongodb", scoreMongo({
      cachePct: used != null && max ? (used / max) * 100 : null,
      queue: readers == null && writers == null ? null : (readers ?? 0) + (writers ?? 0),
      connectionPct: current != null && available != null ? (current / (current + available)) * 100 : null,
      replicaLagSec,
      readLatencyMs: reads?.ops ? (reads.latency ?? 0) / reads.ops / 1000 : null,
    }));
    } catch {
      return countersDenied("mongodb");
    }
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function readPostgres(input: EngineRequest): Promise<ProbeOutcome> {
  const { Client } = await import("pg");
  const client = new Client({
    host: input.host,
    port: input.port,
    user: input.user,
    password: input.password,
    database: input.database || "postgres",
    connectionTimeoutMillis: 8000,
    query_timeout: 8000,
  });
  await client.connect();
  try {
    const cache = await client.query<{ cache_hit: number | null }>(`
      select case when sum(blks_hit) + sum(blks_read) = 0 then null
        else 100.0 * sum(blks_hit) / (sum(blks_hit) + sum(blks_read)) end as cache_hit
      from pg_stat_database
      where datname = current_database()
    `);
    const activity = await client.query<{ waiting: number; active: number }>(`
      select
        count(*) filter (where wait_event_type = 'Lock')::int as waiting,
        count(*) filter (where state = 'active')::int as active
      from pg_stat_activity
      where backend_type = 'client backend'
    `);
    const lag = await client.query<{ lag: number | null }>(`
      select extract(epoch from max(replay_lag))::float8 as lag
      from pg_stat_replication
    `);
    return stored("postgresql", scorePostgres({
      cacheHit: num(cache.rows[0]?.cache_hit),
      waitingLocks: num(activity.rows[0]?.waiting),
      active: num(activity.rows[0]?.active),
      replicaLagSec: num(lag.rows[0]?.lag),
    }));
  } catch {
    return countersDenied("postgresql");
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function readEngineCounters(input: EngineRequest): Promise<ProbeOutcome> {
  try {
    const outcome = await withTimeout((async () => {
      if (input.engine === "mssql") return readMssql(input);
      if (input.engine === "mysql") return readMysql(input);
      if (input.engine === "mongodb") return readMongo(input);
      return readPostgres(input);
    })());
    return outcome;
  } catch (error) {
    const kind = classify(error);
    return kind === "refused" ? refused(input.engine) : notStored(kind);
  }
}
