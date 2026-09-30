---
paths:
  - "**/*.go"
  - "**/go.mod"
  - "**/go.sum"
---
# Go Testing

> 本檔延伸 `~/.claude/AGENTS.md`（跨專案通用規則）；兩者衝突時以 AGENTS.md 為準。

## Framework

Use the standard `go test` with **table-driven tests**.

## Race Detection

Always run with the `-race` flag:

```bash
go test -race ./...
```

## Coverage

```bash
go test -cover ./...
```
