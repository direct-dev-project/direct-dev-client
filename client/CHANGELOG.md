# @direct.dev/client

## 0.7.2

### Patch Changes

- 05f3bf6: chore: export DirectTelemetryManager for internal usage
  - @direct.dev/checkpoint@0.7.2
  - @direct.dev/shared@0.7.2
  - @direct.dev/wire@0.7.2

## 0.7.1

### Patch Changes

- cd761ac: refactor: allow overriding DirectTelemetryManager for external metric aggregation
  - @direct.dev/checkpoint@0.7.1
  - @direct.dev/shared@0.7.1
  - @direct.dev/wire@0.7.1

## 0.7.0

### Patch Changes

- @direct.dev/checkpoint@0.7.0
- @direct.dev/shared@0.7.0
- @direct.dev/wire@0.7.0

## 0.6.3

### Patch Changes

- c6be586: fix: adjust Checkpoint for new hashing structure
- Updated dependencies [c6be586]
  - @direct.dev/checkpoint@0.6.3
  - @direct.dev/shared@0.6.3
  - @direct.dev/wire@0.6.3

## 0.6.2

### Patch Changes

- Updated dependencies [ed413cd]
  - @direct.dev/shared@0.6.2
  - @direct.dev/wire@0.6.2
  - @direct.dev/checkpoint@0.6.2

## 0.6.1

### Patch Changes

- 16ec9b3: perf: refactor request hashing to reduce footprint and avoid event loop hops
- Updated dependencies [16ec9b3]
  - @direct.dev/shared@0.6.1
  - @direct.dev/wire@0.6.1
  - @direct.dev/checkpoint@0.6.1

## 0.6.0

### Patch Changes

- Updated dependencies [50199dd]
  - @direct.dev/checkpoint@0.6.0
  - @direct.dev/shared@0.6.0
  - @direct.dev/wire@0.6.0

## 0.5.4

### Patch Changes

- b0f1de0: fix: analysis of request syncing eligibility
- 6ade921: chore: rename telemetry endpoint
- 9ec768f: fix: avoid throwing JSON.parse errors on faulty patches
  - @direct.dev/checkpoint@0.5.4
  - @direct.dev/shared@0.5.4
  - @direct.dev/wire@0.5.4

## 0.5.3

### Patch Changes

- b4a688f: fix: close sync stream after extended periods of inactivity
  - @direct.dev/checkpoint@0.5.3
  - @direct.dev/shared@0.5.3
  - @direct.dev/wire@0.5.3

## 0.5.2

### Patch Changes

- 0df0ed9: chore: log response times as info
  - @direct.dev/checkpoint@0.5.2
  - @direct.dev/shared@0.5.2
  - @direct.dev/wire@0.5.2

## 0.5.1

### Patch Changes

- 28f2549: fix: add config validation and automatic failover node inferrence
- 36019eb: fix: ensure correctness of response IDs in all paths
- Updated dependencies [28f2549]
  - @direct.dev/checkpoint@0.5.1
  - @direct.dev/shared@0.5.1
  - @direct.dev/wire@0.5.1

## 0.5.0

### Minor Changes

- 8c1f2c0: feat: implement direct_getTransactionReceipt for real-time transaction finality
- 8c1f2c0: feat: implement Direct Sync for ahead-of-time data delivery and 0ms latency
- f1b30ce: feat: implement @direct.dev/checkpoint for dependency free validations

### Patch Changes

- 9649cff: fix: implement DirectClockManager to gracefully handle clients with skewed time
- Updated dependencies [9649cff]
- Updated dependencies [8c1f2c0]
- Updated dependencies [8c1f2c0]
- Updated dependencies [f1b30ce]
  - @direct.dev/wire@0.5.0
  - @direct.dev/shared@0.5.0
  - @direct.dev/checkpoint@0.5.0

## 0.4.2

### Patch Changes

- b49e213: perf: truncate data ingestion to reduce bandwidth usage
- Updated dependencies [b49e213]
  - @direct.dev/shared@0.4.2
  - @direct.dev/wire@0.4.2

## 0.4.1

### Patch Changes

- b156665: feat: auto-split large request chunks
- Updated dependencies [b156665]
  - @direct.dev/shared@0.4.1
  - @direct.dev/wire@0.4.1

## 0.4.0

### Minor Changes

- 5dd8b8b: refactor: improve cache key design to streamline delivery of correct data

### Patch Changes

- Updated dependencies [5dd8b8b]
  - @direct.dev/shared@0.4.0
  - @direct.dev/wire@0.4.0

## 0.3.1

### Patch Changes

- 9c780f4: close race condition that could re-fetch predictively prefetched requests
- Updated dependencies [9c780f4]
  - @direct.dev/wire@0.3.1
  - @direct.dev/shared@0.3.1

## 0.3.0

### Minor Changes

- 2137685: optimize critical request path for performance

### Patch Changes

- Updated dependencies [2137685]
  - @direct.dev/shared@0.3.0
  - @direct.dev/wire@0.3.0

## 0.2.0

### Patch Changes

- @direct.dev/shared@0.2.0
- @direct.dev/wire@0.2.0

## 0.1.3

### Patch Changes

- 86f6740: minor adjustments to README.md files
- Updated dependencies [86f6740]
  - @direct.dev/wire@0.1.3
  - @direct.dev/shared@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies [4d94acf]
  - @direct.dev/wire@0.1.2
  - @direct.dev/shared@0.1.2

## 0.1.1

### Patch Changes

- 37c8316: clean up README.md
- Updated dependencies [37c8316]
  - @direct.dev/shared@0.1.1
  - @direct.dev/wire@0.1.1

## 0.1.0

### Minor Changes

- 6c46015: Initial alpha release

### Patch Changes

- Updated dependencies [6c46015]
  - @direct.dev/shared@0.1.0
  - @direct.dev/wire@0.1.0
