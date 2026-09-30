---
paths:
  - "**/*.go"
  - "**/go.mod"
  - "**/go.sum"
---
# Go Coding Style

> 本檔延伸 `~/.claude/AGENTS.md`（跨專案通用規則）；兩者衝突時以 AGENTS.md 為準。

## Formatting

- **gofmt** and **goimports** are mandatory — no style debates

## Design Principles

- Accept interfaces, return structs
- Keep interfaces small (1-3 methods)

## Error Handling

Always wrap errors with context:

```go
if err != nil {
    return fmt.Errorf("failed to create user: %w", err)
}
```
