import assert from "node:assert/strict";
import test from "node:test";
import { scoreMongo, scoreMssql, scoreMysql, scorePostgres } from "./engine-score.ts";

test("a quiet SQL Server stays healthy", () => {
  const score = scoreMssql({ sqlCpu: 20, bufferHit: 99.8, pageLifeSec: 1200, blocked: 0, agUnhealthy: false, redoMb: 2 });
  assert.equal(score.status, "Healthy");
  assert.ok(score.performance >= 80);
  assert.match(score.detail, /SQL CPU 20%/);
});

test("blocked sessions and high SQL CPU are pressure, not a made-up CPU spare number", () => {
  const score = scoreMssql({ sqlCpu: 95, bufferHit: 90, pageLifeSec: 40, blocked: 3, agUnhealthy: true, redoMb: 400 });
  assert.equal(score.status, "Critical");
  assert.match(score.detail, /blocked 3/);
  assert.match(score.detail, /redo queue 400 MB/);
});

test("missing counters are not measured", () => {
  const score = scoreMysql({ bufferHit: null, threadsRunning: null, connectionPct: null, replicaLagSec: null });
  assert.equal(score.performance, -1);
  assert.equal(score.status, "Not measured");
});

test("a replica row with no lag is not treated as caught up", () => {
  const score = scoreMysql({ bufferHit: 100, threadsRunning: 1, connectionPct: 10, replicaLagSec: null, replicaUnknown: true });
  assert.match(score.detail, /replica lag unknown/);
  assert.ok(score.performance <= 80);
});

test("replica lag lowers the MySQL score by the lag itself", () => {
  const quiet = scoreMysql({ bufferHit: 100, threadsRunning: 1, connectionPct: 10, replicaLagSec: 0 });
  const behind = scoreMysql({ bufferHit: 100, threadsRunning: 1, connectionPct: 10, replicaLagSec: 30 });
  assert.ok(behind.performance <= quiet.performance - 30);
  assert.match(behind.detail, /replica lag 30 s/);
});

test("MongoDB read latency is the server average, and only when it is reported", () => {
  const score = scoreMongo({ cachePct: 40, queue: 0, connectionPct: 10, replicaLagSec: 0, readLatencyMs: 200 });
  assert.match(score.detail, /avg read 200 ms/);
  assert.ok(score.performance < 100);
  const standalone = scoreMongo({ cachePct: 40, queue: 0, connectionPct: 10, replicaLagSec: null, readLatencyMs: null });
  assert.doesNotMatch(standalone.detail, /avg read/);
  assert.equal(standalone.status, "Healthy");
});

test("PostgreSQL lock waits are visible", () => {
  const score = scorePostgres({ cacheHit: 100, waitingLocks: 2, active: 4, replicaLagSec: null });
  assert.match(score.detail, /lock waits 2/);
  assert.ok(score.performance <= 70);
});
