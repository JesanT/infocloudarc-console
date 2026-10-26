import assert from "node:assert/strict";
import test from "node:test";
import { countersFromPrometheus, countersFromTomcat, outcomeFromHttp, scoreApplication } from "./app-score.ts";

const quietXml = `<?xml version="1.0"?>
<status>
  <jvm><memory free='600' total='700' max='1000'/></jvm>
  <connector name="http-nio-8080">
    <threadInfo maxThreads="200" currentThreadCount="8" currentThreadsBusy="4"/>
    <requestInfo maxTime="20" processingTime="2000" requestCount="100" errorCount="0"/>
  </connector>
</status>`;

test("a quiet Tomcat status page stays healthy", () => {
  const counters = countersFromTomcat(quietXml);
  assert.ok(counters);
  assert.equal(Math.round(counters.memoryUsedPct ?? -1), 10);
  const outcome = outcomeFromHttp(200, quietXml);
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.up, 1);
  assert.equal(outcome.source, "tomcat");
  assert.ok(outcome.performance >= 80);
  assert.match(outcome.detail, /heap 10%/);
  assert.match(outcome.detail, /avg processing 20 ms/);
});

test("a hot heap, busy threads, and errors are critical", () => {
  const score = scoreApplication({
    memoryUsedPct: 96,
    memoryLabel: "heap",
    threadsBusyPct: 90,
    errorPct: 10,
    avgProcessingMs: 20,
  });
  assert.equal(score.status, "Critical");
  assert.match(score.detail, /errors 10.0%/);
});

test("missing application counters are not measured", () => {
  const score = scoreApplication({ memoryUsedPct: null, memoryLabel: "heap", threadsBusyPct: null, errorPct: null, avgProcessingMs: null });
  assert.equal(score.performance, -1);
});

test("a metrics page uses memory, and a plain page does not invent a score", () => {
  const text = `# HELP node_memory_MemTotal_bytes x\nnode_memory_MemTotal_bytes 1000\nnode_memory_MemAvailable_bytes 100\n`;
  const counters = countersFromPrometheus(text);
  assert.equal(Math.round(counters?.memoryUsedPct ?? -1), 90);
  const scored = outcomeFromHttp(200, text);
  assert.equal(scored.ok && scored.source, "metrics");
  const plain = outcomeFromHttp(200, "<html><body>ok</body></html>");
  assert.equal(plain.ok && plain.performance, -1);
  assert.equal(plain.ok && plain.up, 1);
});

test("a refused login and a missing path are not stored as downtime", () => {
  const login = outcomeFromHttp(401, "");
  assert.equal(login.ok, false);
  const missing = outcomeFromHttp(404, "");
  assert.equal(missing.ok, false);
  const failed = outcomeFromHttp(503, "");
  assert.equal(failed.ok, true);
  if (failed.ok) assert.equal(failed.up, 0);
});
