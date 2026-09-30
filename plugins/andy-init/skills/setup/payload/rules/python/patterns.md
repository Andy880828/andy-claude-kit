---
paths:
  - "**/*.py"
  - "**/*.pyi"
---
# Python Patterns

> 本檔延伸 `~/.claude/AGENTS.md`（跨專案通用規則）；兩者衝突時以 AGENTS.md 為準。

## Protocol (Duck Typing)

```python
from typing import Protocol

class Repository(Protocol):
    def find_by_id(self, id: str) -> dict | None: ...
    def save(self, entity: dict) -> dict: ...
```

## Dataclasses as DTOs

```python
from dataclasses import dataclass

@dataclass
class CreateUserRequest:
    name: str
    email: str
    age: int | None = None
```

## Context Managers & Generators

- Use context managers (`with` statement) for resource management
- Use generators for lazy evaluation and memory-efficient iteration
