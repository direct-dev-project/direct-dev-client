# @direct.dev/client

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
