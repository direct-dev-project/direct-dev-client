import { it, expect, vi, afterEach, beforeEach } from "vitest";

import { DirectClockManager } from "../core.clock.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it("defaults to an infinite offset that effectively disables local caching", () => {
  const clock = new DirectClockManager();

  // With Infinity offset, clientTimeMs -> Infinity, delta -> -Infinity
  const server = new Date(1_000_000);
  const client = new Date(1_000_000);

  const delta = clock.computeDelta(server, client);
  expect(delta).toBe(-Infinity);

  expect(clock.isFuture(server, client)).toBe(false);
  expect(clock.isPast(server, client)).toBe(true);
});

it("updates offset via NTP and accepts lower-than-median delay samples; rejects high-delay outliers", () => {
  const mgr = new DirectClockManager();

  // --- Sample #1 (baseline): offset = 0, delay = 200 ---
  // T1=1000 (client send), T2=1100 (server recv), T3=1200 (server send),
  // T4=1300 (client recv)
  vi.setSystemTime(1300);
  mgr.updateOffset(new Date(1000), new Date(1100), new Date(1200));
  // offset = ((1100-1000) + (1200-1300)) / 2 = (100-100)/2 = 0
  // delay  = (1300-1000) - (1200-1100) = 300-100 = 200

  // With offset 0, computeDelta(server, client) should be 0 for equal times
  expect(mgr.computeDelta(new Date(2000), new Date(2000))).toBe(0);

  // --- Sample #2 (better delay): target offset = +50, delay = 100 ->
  // accepted --- Choose times so offset = +50 and delay = 100: offset =
  // ((T2-T1) + (T3-T4)) / 2 Set T1=2000, T2=2100, T3=2600, T4=2600 -> offset
  // = (100 + 0)/2 = 50; delay = (600) - (500) = 100
  vi.setSystemTime(2600);
  mgr.updateOffset(new Date(2000), new Date(2100), new Date(2600));

  // Now the effective offset should be ≈ +50 (accepted as lower-than-median
  // delay). If server == client + offset, delta == 0
  expect(mgr.computeDelta(new Date(4000 + 50), new Date(4000))).toBe(0);

  // --- Sample #3 (worse delay): produce a very large delay; should be
  // rejected --- Let T1=3000, T2=3100, T3=3600, T4=3800: offset = ((100) +
  // (3600-3800))/2 = (100-200)/2 = -50 delay  = (800) - (500) = 300 (worse
  // than median of [200,100,300] -> 200)
  vi.setSystemTime(3800);
  mgr.updateOffset(new Date(3000), new Date(3100), new Date(3600));

  // Offset should remain near +50 (i.e., not jump to -50)
  expect(mgr.computeDelta(new Date(5000 + 50), new Date(5000))).toBe(0);
});

it("isFuture / isPast reflect the computed delta", () => {
  const clock = new DirectClockManager();

  // Create an accepted offset of +50 ms (server ahead)
  vi.setSystemTime(2600);
  clock.updateOffset(new Date(2000), new Date(2100), new Date(2600)); // offset +50, delay 100

  const clientNow = new Date(10_000);

  // Server timestamp 10ms ahead of (clientNow + offset) => future
  const serverFuture = new Date(10_000 + 50 + 10);
  expect(clock.isFuture(serverFuture, clientNow)).toBe(true);
  expect(clock.isPast(serverFuture, clientNow)).toBe(false);

  // Server timestamp 10ms behind (clientNow + offset) => past
  const serverPast = new Date(10_000 + 50 - 10);
  expect(clock.isFuture(serverPast, clientNow)).toBe(false);
  expect(clock.isPast(serverPast, clientNow)).toBe(true);

  // Exactly aligned
  const serverEqual = new Date(10_000 + 50);
  expect(clock.isFuture(serverEqual, clientNow)).toBe(false);
  expect(clock.isPast(serverEqual, clientNow)).toBe(false);
});

it("works with SNTP-like responses where the server returns a single timestamp (t2 === t3)", () => {
  const clock = new DirectClockManager();

  // Use t2 === t3 === TS
  // Let T1=5000, TS=5600, choose T4=5600 -> offset =
  // ((5600-5000)+(5600-5600))/2 = (600+0)/2 = 300 delay = (5600-5000) -
  // (5600-5600) = 600 - 0 = 600 (accepted as first sample)
  vi.setSystemTime(5600);
  clock.updateOffset(new Date(5000), new Date(5600), new Date(5600));

  // Verify offset ≈ +300
  expect(clock.computeDelta(new Date(8000 + 300), new Date(8000))).toBe(0);
});
