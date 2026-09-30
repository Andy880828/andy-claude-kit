import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { findResidue, transformRule } from '../../../tools/sync-rules.mjs';

const RULES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../skills/setup/payload/rules');

const SAMPLE = `---
paths:
  - "**/*.py"
---
# Python Testing

> This file extends [common/testing.md](../common/testing.md) with Python specific content.

## Coverage

- Target 80%+ line coverage

## Agent Support

- **e2e-runner** - Playwright E2E testing specialist

## Reference

See skill: \`python-testing\` for detailed pytest patterns and fixtures.
`;

test('transformRule：改寫 extends、刪 skill/agent 引用與衝突條目、清掉空標題', () => {
  const { text, notes } = transformRule(SAMPLE);
  assert.match(text, /^---\npaths:/, 'frontmatter 保留在最前面');
  assert.match(text, /本檔延伸 `~\/\.claude\/AGENTS\.md`/);
  assert.doesNotMatch(text, /## Agent Support|e2e-runner|See skill|80%|## Reference|## Coverage/);
  assert.deepEqual(findResidue(text), []);
  assert.equal(notes.length, 3);
});

test('findResidue：偵測得到漏網的依賴（正例）', () => {
  assert.ok(findResidue('See skill: `x`').length > 0);
  assert.ok(findResidue('- ECC skills: `a`').length > 0);
  assert.ok(findResidue('[x](../common/a.md)').length > 0);
});

test('payload 內的 rules：非空、每個都有 paths frontmatter、無殘留依賴', () => {
  const files = fs.readdirSync(RULES_DIR, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.md') && f !== 'README.md');
  assert.ok(files.length >= 20, `預期至少 20 個 rule 檔，實際 ${files.length}`); // 空跑防護
  for (const f of files) {
    const text = fs.readFileSync(path.join(RULES_DIR, f), 'utf8');
    assert.match(text, /^---\r?\npaths:/, `${f} 缺 paths frontmatter`);
    assert.deepEqual(findResidue(text), [], `${f} 有殘留依賴`);
    assert.ok(!f.endsWith('hooks.md'), `${f} 不該被帶入`);
  }
});
