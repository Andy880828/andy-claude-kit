---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
---
# TypeScript/JavaScript Security

> 本檔延伸 `~/.claude/AGENTS.md`（跨專案通用規則）；兩者衝突時以 AGENTS.md 為準。

## Secret Management

```typescript
// NEVER: Hardcoded secrets
const apiKey = "sk-proj-xxxxx"

// ALWAYS: Environment variables
const apiKey = process.env.API_KEY

if (!apiKey) {
  throw new Error('API_KEY not configured')
}
```
