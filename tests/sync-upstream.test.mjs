import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { AGENTS, findResidue, transformAgent, transformRule } from '../tools/sync-upstream.mjs';

const PLUGIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '../plugins/andy-init');
const RULES_DIR = path.join(PLUGIN, 'skills/setup/payload/rules');
const AGENTS_DIR = path.join(PLUGIN, 'agents');

const SAMPLE_RULE = `---
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

const SAMPLE_AGENT = `---
name: demo-reviewer
description: Demo.
tools: Read, Grep, Glob, Bash
model: sonnet
---

## Review

- Check things.

> **For React-specific review, prefer \`react-reviewer\` via \`/react-review\`.**

For detailed patterns, see \`skill: demo-patterns\`.
`;

test('transformRule：改寫 extends、刪 skill/agent 引用與衝突條目、清掉空標題', () => {
  const { text, notes } = transformRule(SAMPLE_RULE);
  assert.match(text, /^---\npaths:/, 'frontmatter 保留在最前面');
  assert.match(text, /本檔延伸 `~\/\.claude\/AGENTS\.md`/);
  assert.doesNotMatch(text, /## Agent Support|e2e-runner|See skill|80%|## Reference|## Coverage/);
  assert.deepEqual(findResidue(text), []);
  assert.equal(notes.length, 3);
});

test('transformAgent：frontmatter 保留、插入唯讀前言、刪 skill 與 react-reviewer 引用', () => {
  const { text } = transformAgent(SAMPLE_AGENT);
  assert.match(text, /^---\nname: demo-reviewer\n/);
  assert.match(text, /---\n\n> 本 agent 只負責審查與回報證據/);
  assert.doesNotMatch(text, /react-review|skill: demo-patterns/);
  assert.deepEqual(findResidue(text), []);
});

test('transformAgent：有 Write/Edit 或未宣告 tools 的 agent 一律拒絕', () => {
  assert.throws(() => transformAgent(SAMPLE_AGENT.replace('tools: Read, Grep, Glob, Bash', 'tools: Read, Write, Edit')), /不是唯讀/);
  assert.throws(() => transformAgent(SAMPLE_AGENT.replace('tools: Read, Grep, Glob, Bash\n', '')), /不是唯讀/);
});

test('findResidue：偵測得到漏網的依賴（正例）', () => {
  assert.ok(findResidue('See skill: `x`').length > 0);
  assert.ok(findResidue('see skills: `a` and `b`').length > 0);
  assert.ok(findResidue('- ECC skills: `a`').length > 0);
  assert.ok(findResidue('[x](../common/a.md)').length > 0);
  assert.ok(findResidue('prefer /react-review').length > 0);
});

function mdFiles(dir) {
  return fs.readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith('.md'));
}

test('payload 內的 rules：非空、每個都有 paths frontmatter、無殘留依賴', () => {
  const files = mdFiles(RULES_DIR);
  assert.ok(files.length >= 20, `預期至少 20 個 rule 檔，實際 ${files.length}`); // 空跑防護
  for (const f of files) {
    const text = fs.readFileSync(path.join(RULES_DIR, f), 'utf8');
    assert.match(text, /^---\r?\npaths:/, `${f} 缺 paths frontmatter（說明檔不能放這裡，會被當成 rule 載入）`);
    assert.deepEqual(findResidue(text), [], `${f} 有殘留依賴`);
    assert.ok(!f.endsWith('hooks.md'), `${f} 不該被帶入`);
  }
});

test('plugin agents：正好是清單上的唯讀審查者、無殘留依賴、有本地前言', () => {
  const files = mdFiles(AGENTS_DIR).sort();
  assert.deepEqual(files, AGENTS.map((a) => `${a}.md`).sort()); // 也擋掉誤放的 README
  for (const f of files) {
    const text = fs.readFileSync(path.join(AGENTS_DIR, f), 'utf8');
    assert.match(text, /^tools: Read, Grep, Glob, Bash$/m, `${f} 工具不是唯讀`);
    assert.match(text, /不修改任何檔案/, `${f} 缺本地前言`);
    assert.deepEqual(findResidue(text), [], `${f} 有殘留依賴`);
  }
});
