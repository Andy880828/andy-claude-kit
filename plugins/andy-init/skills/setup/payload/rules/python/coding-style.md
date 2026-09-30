---
paths:
  - "**/*.py"
  - "**/*.pyi"
---
# Python Coding Style

> 本檔延伸 `~/.claude/AGENTS.md`（跨專案通用規則）；兩者衝突時以 AGENTS.md 為準。

## Standards

- Follow **PEP 8** conventions
- Use **type annotations** on all function signatures

## Immutability

Prefer immutable data structures:

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class User:
    name: str
    email: str

from typing import NamedTuple

class Point(NamedTuple):
    x: float
    y: float
```

## Formatting

- **black** for code formatting
- **isort** for import sorting
- **ruff** for linting
