// Counters published by the application server. 100 means the counters that
// came back are in a normal range. It is not a stopwatch around one request.

import { statusFrom, type EngineCounter, type EngineScore } from "./engine-score.ts";

export type AppCounters = {
  memoryUsedPct: number | null;
  memoryLabel: "heap" | "memory";
  threadsBusyPct: number | null;
  errorPct: number | null;
  avgProcessingMs: number | null;
};

export type AppHttpResult =
  | { ok: true; up: 0 | 1; performance: number; source: string; detail: string }
  | { ok: false; message: string };

const emptyCounters: AppCounters = {
  memoryUsedPct: null,
  memoryLabel: "heap",
  threadsBusyPct: null,
  errorPct: null,
  avgProcessingMs: null,
};

export function defaultAppPath(kind: string, port: number) {
  if (kind === "tomcat") return "/manager/status/all?XML=true";
  if (port === 9100) return "/metrics";
  return "/";
}

export function appReading(kind: string) {
  if (kind === "tomcat") {
    return "Tomcat Manager status: heap, busy threads, error ratio, and the average processing time Tomcat itself reports.";
  }
  if (kind === "iis") {
    return "The site is requested directly. Performance is scored only when that response is a status or metrics page. A normal page shows the site is up, not how fast it is.";
  }
  return "A metrics page is scored when one is published. Otherwise a successful response is availability only.";
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function finish(counters: EngineCounter[], penalties: number[]): EngineScore {
  const detail = counters.map((counter) => `${counter.label} ${counter.value}`).join(" · ");
  if (penalties.length === 0) {
    return { performance: -1, status: "Not measured", detail: detail || "No counters were returned.", counters };
  }
  const performance = clamp(100 - penalties.reduce((sum, value) => sum + value, 0));
  return { performance, status: statusFrom(performance), detail, counters };
}

export function scoreApplication(input: AppCounters): EngineScore {
  const counters: EngineCounter[] = [];
  const penalties: number[] = [];
  if (input.memoryUsedPct != null) {
    counters.push({ label: input.memoryLabel, value: `${Math.round(input.memoryUsedPct)}%` });
    penalties.push(Math.max(0, input.memoryUsedPct - 85) * 2);
  }
  if (input.threadsBusyPct != null) {
    counters.push({ label: "busy threads", value: `${Math.round(input.threadsBusyPct)}%` });
    penalties.push(Math.max(0, input.threadsBusyPct - 70) * 1.2);
  }
  if (input.errorPct != null) {
    counters.push({ label: "errors", value: `${input.errorPct.toFixed(1)}%` });
    penalties.push(input.errorPct > 1 ? Math.min(30, input.errorPct * 4) : 0);
  }
  if (input.avgProcessingMs != null) {
    counters.push({ label: "avg processing", value: `${Math.round(input.avgProcessingMs)} ms` });
    penalties.push(input.avgProcessingMs > 250 ? Math.min(30, (input.avgProcessingMs - 250) / 25) : 0);
  }
  return finish(counters, penalties);
}

function tagAttrs(xml: string, tag: string) {
  const out: Array<Record<string, string>> = [];
  const re = new RegExp(`<${tag}\\b([^>]*?)\\/?>`, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    const attrs: Record<string, string> = {};
    const attrRe = /([A-Za-z_:][\w:.-]*)\s*=\s*(['"])(.*?)\2/g;
    let attr: RegExpExecArray | null;
    while ((attr = attrRe.exec(match[1]))) attrs[attr[1].toLowerCase()] = attr[3];
    out.push(attrs);
  }
  return out;
}

function attrNum(attrs: Record<string, string> | undefined, name: string) {
  if (!attrs) return null;
  const value = Number(attrs[name.toLowerCase()]);
  return Number.isFinite(value) ? value : null;
}

export function countersFromTomcat(xml: string): AppCounters | null {
  if (!/<status\b/i.test(xml) || !/<memory\b/i.test(xml)) return null;
  const memory = tagAttrs(xml, "memory")[0];
  const free = attrNum(memory, "free");
  const total = attrNum(memory, "total");
  const max = attrNum(memory, "max");
  const counters: AppCounters = { ...emptyCounters };
  if (free != null && total != null && max != null && max > 0) {
    counters.memoryUsedPct = Math.max(0, Math.min(100, ((total - free) / max) * 100));
    counters.memoryLabel = "heap";
  }
  let busy = 0;
  let maxThreads = 0;
  let sawThreads = false;
  for (const row of tagAttrs(xml, "threadInfo")) {
    const current = attrNum(row, "currentThreadsBusy");
    const limit = attrNum(row, "maxThreads");
    if (current == null || limit == null) continue;
    sawThreads = true;
    busy += current;
    maxThreads += limit;
  }
  if (sawThreads && maxThreads > 0) counters.threadsBusyPct = (busy / maxThreads) * 100;
  let processing = 0;
  let requests = 0;
  let errors = 0;
  let sawRequests = false;
  for (const row of tagAttrs(xml, "requestInfo")) {
    const count = attrNum(row, "requestCount");
    if (count == null) continue;
    sawRequests = true;
    requests += count;
    processing += attrNum(row, "processingTime") ?? 0;
    errors += attrNum(row, "errorCount") ?? 0;
  }
  if (sawRequests && requests > 0) {
    counters.errorPct = (errors / requests) * 100;
    counters.avgProcessingMs = processing / requests;
  }
  return counters;
}

type PromSample = { name: string; labels: Record<string, string>; value: number };

function promSamples(text: string): PromSample[] {
  const samples: PromSample[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([a-zA-Z_:][\w:]*)(\{([^}]*)\})?\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/);
    if (!match) continue;
    const labels: Record<string, string> = {};
    if (match[3]) {
      const labelRe = /([A-Za-z_][\w]*)\s*=\s*"([^"]*)"/g;
      let label: RegExpExecArray | null;
      while ((label = labelRe.exec(match[3]))) labels[label[1]] = label[2];
    }
    const value = Number(match[4]);
    if (Number.isFinite(value)) samples.push({ name: match[1], labels, value });
  }
  return samples;
}

function sumWhere(samples: PromSample[], name: string, accept: (sample: PromSample) => boolean) {
  const rows = samples.filter((sample) => sample.name === name && accept(sample));
  if (rows.length === 0) return null;
  return rows.reduce((sum, sample) => sum + sample.value, 0);
}

export function countersFromPrometheus(text: string): AppCounters | null {
  if (/<html[\s>]/i.test(text)) return null;
  const samples = promSamples(text);
  if (samples.length < 2 && !/(^|\n)\s*#\s*(HELP|TYPE)\s+/i.test(text)) return null;
  if (samples.length === 0) return null;
  const counters: AppCounters = { ...emptyCounters, memoryLabel: "memory" };
  const heapUsed = sumWhere(samples, "jvm_memory_used_bytes", (sample) => sample.labels.area === "heap" && sample.value >= 0);
  const heapMax = sumWhere(samples, "jvm_memory_max_bytes", (sample) => sample.labels.area === "heap" && sample.value > 0);
  if (heapUsed != null && heapMax != null && heapMax > 0) {
    counters.memoryUsedPct = Math.max(0, Math.min(100, (heapUsed / heapMax) * 100));
    counters.memoryLabel = "heap";
  } else {
    const total = sumWhere(samples, "node_memory_MemTotal_bytes", () => true);
    const available = sumWhere(samples, "node_memory_MemAvailable_bytes", () => true);
    if (total != null && available != null && total > 0) {
      counters.memoryUsedPct = Math.max(0, Math.min(100, ((total - available) / total) * 100));
    }
  }
  const busy = sumWhere(samples, "tomcat_threads_busy_threads", (sample) => sample.value >= 0);
  const maxThreads = sumWhere(samples, "tomcat_threads_config_max_threads", (sample) => sample.value > 0);
  if (busy != null && maxThreads != null && maxThreads > 0) counters.threadsBusyPct = (busy / maxThreads) * 100;
  const requestCount = sumWhere(samples, "http_server_requests_seconds_count", () => true);
  const requestSum = sumWhere(samples, "http_server_requests_seconds_sum", () => true);
  const errorCount = sumWhere(samples, "http_server_requests_seconds_count", (sample) => sample.labels.status?.startsWith("5") === true);
  if (requestCount != null && requestCount > 0) {
    counters.errorPct = ((errorCount ?? 0) / requestCount) * 100;
    if (requestSum != null) counters.avgProcessingMs = (requestSum / requestCount) * 1000;
  }
  return counters;
}

function scored(source: string, counters: AppCounters, emptyDetail: string): AppHttpResult {
  const score = scoreApplication(counters);
  if (score.performance < 0) return { ok: true, up: 1, performance: -1, source, detail: emptyDetail };
  return { ok: true, up: 1, performance: score.performance, source, detail: score.detail };
}

export function outcomeFromHttp(status: number, body: string): AppHttpResult {
  if (status === 401) {
    return { ok: false, message: "The application refused the login. Nothing was stored. A bad password is not downtime." };
  }
  if (status === 404) return { ok: false, message: "That path was not found. Nothing was stored." };
  if (status === 403) {
    return { ok: true, up: 1, performance: -1, source: "application", detail: "Connected, but this login cannot read the status page." };
  }
  if (status >= 300 && status < 400) {
    return { ok: true, up: 1, performance: -1, source: "http", detail: `The application redirected (HTTP ${status}). Counters were not returned.` };
  }
  if (status >= 500) {
    return { ok: true, up: 0, performance: -1, source: "http", detail: `The application returned HTTP ${status}.` };
  }
  if (status < 200 || status >= 400) return { ok: false, message: `HTTP ${status}. Nothing was stored.` };
  const tomcat = countersFromTomcat(body);
  if (tomcat) return scored("tomcat", tomcat, "Tomcat answered, but the status page had no counters.");
  const metrics = countersFromPrometheus(body);
  if (metrics) return scored("metrics", metrics, "The metrics page answered, but it did not include heap, thread, or request counters.");
  return {
    ok: true,
    up: 1,
    performance: -1,
    source: "http",
    detail: `The application answered HTTP ${status}. The body was not Tomcat status or a metrics page, so performance was not scored.`,
  };
}
