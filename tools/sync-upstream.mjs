#!/usr/bin/env node
// 從上游 ECC 擷取語言 rules 與唯讀 reviewer agents，去除對 ECC skill / agent / common rules 的依賴後寫進 plugin。
// 用法：node tools/sync-upstream.mjs [--src <已 clone 的 ECC 目錄>]
// 省略 --src 時會 git clone --depth 1 到暫存目錄。擷取規則全部集中在本檔，不要手改產物。
// 來源 commit 與逐項移除紀錄寫在 tools/UPSTREAM.md（不隨 plugin 發佈）。

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const UPSTREAM_URL = 'https://github.com/affaan-m/ECC';
export const LANGS = ['python', 'typescript', 'golang', 'rust', 'vue', 'web'];
// 只帶唯讀審查者：AGENTS.md §13「子 agent 負責搞清楚，不負責動手」。
export const AGENTS = [
  'python-reviewer',
  'typescript-reviewer',
  'go-reviewer',
  'rust-reviewer',
  'database-reviewer',
  'security-reviewer',
];
const READ_ONLY_TOOLS = new Set(['Read', 'Grep', 'Glob', 'Bash']);

// hooks.md 描述的是 ECC 的自動化 hook；不裝那些 hook 卻留著說明就是假旋鈕（AGENTS.md §6）。
export const SKIP_RULE_FILES = new Set(['hooks.md']);

const EXTENDS_LINE = /^> This file extends \[common\/[^\]]+\]\([^)]+\) with .*$/;
const EXTENDS_REPLACEMENT =
  '> 本檔延伸 `~/.claude/AGENTS.md`（跨專案通用規則）；兩者衝突時以 AGENTS.md 為準。';
const AGENT_PREAMBLE = [
  '> 本 agent 只負責審查與回報證據，**不修改任何檔案**；修正由主線執行並驗證。',
  '> 判斷標準以 `~/.claude/AGENTS.md` 與專案 `AGENTS.md` 為準，與本檔衝突時照它們。',
  '> 回報一律使用繁體中文。',
];

// 逐行刪除：指向 ECC skill / hook / 未帶入 agent 的引用，以及與 AGENTS.md 衝突的條目。
const DROP_LINES = [
  { re: /^See skill: .*$/, why: '指向 ECC skill' },
  { re: /\bsee `?skills?:/i, why: '指向 ECC skill' },
  { re: /^- ECC skills: .*$/, why: '指向 ECC skill' },
  { re: /^\d+\. Use ECC design\/frontend skills where relevant\.$/, why: '指向 ECC skill' },
  { re: /^- See hooks for automatic detection$/, why: '指向未安裝的 ECC hook' },
  { re: /^- Target 80%\+ line coverage$/, why: '覆蓋率硬指標與 AGENTS.md §1「證據優先於綠燈」衝突' },
  { re: /react-reviewer|\/react-review/, why: '指向未帶入的 react-reviewer agent' },
  { re: /does not yet ship a dedicated .* skill/, why: '指向 ECC skill' },
];

// 整段刪除（標題到下一個同級標題）：ECC agent 推薦。
const DROP_SECTIONS = [{ heading: /^## Agent Support\s*$/, why: '推薦 ECC agent' }];

// 殘留檢查：轉換後仍出現就視為擷取規則漏網，直接失敗而不是默默寫出。
export const RESIDUE_PATTERNS = [
  /See skill:/i,
  /\bskills?: `/i,
  /\bECC\b/,
  /\]\(\.\.\/common\//,
  /## Agent Support/,
  /react-review/,
  /e2e-runner|tdd-guide|code-reviewer|doc-updater/,
];

function dropSections(lines, notes) {
  const out = [];
  let skipping = false;
  for (const line of lines) {
    const rule = DROP_SECTIONS.find((s) => s.heading.test(line));
    if (rule) {
      skipping = true;
      notes.push(`刪除段落「${line.trim()}」：${rule.why}`);
      continue;
    }
    if (skipping && /^#{1,2} /.test(line)) skipping = false;
    if (!skipping) out.push(line);
  }
  return out;
}

// 刪完引用後可能留下空的「## Reference」之類標題，一併拿掉。
function dropEmptySections(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^## /.test(lines[i])) {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j >= lines.length || /^#{1,2} /.test(lines[j])) {
        i = j - 1;
        continue;
      }
    }
    out.push(lines[i]);
  }
  return out;
}

function collapseBlankLines(lines) {
  const out = [];
  for (const line of lines) {
    if (line.trim() === '' && out.length && out[out.length - 1].trim() === '') continue;
    out.push(line);
  }
  while (out.length && out[out.length - 1].trim() === '') out.pop();
  return out;
}

function cleanLines(lines, notes) {
  lines = lines.map((line) => (EXTENDS_LINE.test(line) ? EXTENDS_REPLACEMENT : line));
  lines = lines.filter((line) => {
    const rule = DROP_LINES.find((d) => d.re.test(line));
    if (rule) notes.push(`刪除「${line.trim().slice(0, 90)}」：${rule.why}`);
    return !rule;
  });
  lines = dropSections(lines, notes);
  return collapseBlankLines(dropEmptySections(lines));
}

function splitLines(text) {
  return { eol: text.includes('\r\n') ? '\r\n' : '\n', lines: text.split(/\r?\n/) };
}

/** 轉換單一 rule 檔。回傳新內容與被移除項目的說明。 */
export function transformRule(text) {
  const notes = [];
  const { eol, lines } = splitLines(text);
  return { text: cleanLines(lines, notes).join(eol) + eol, notes };
}

/** 轉換單一 agent 檔：檢查唯讀、清引用、在 frontmatter 後插入本地前言。 */
export function transformAgent(text) {
  const notes = [];
  const { eol, lines } = splitLines(text);
  const end = lines.indexOf('---', 1);
  if (lines[0] !== '---' || end === -1) throw new Error('agent 缺少 frontmatter');

  const tools = (lines.slice(1, end).find((l) => l.startsWith('tools:')) || '')
    .replace('tools:', '').split(',').map((t) => t.trim()).filter(Boolean);
  const writable = tools.filter((t) => !READ_ONLY_TOOLS.has(t));
  if (!tools.length || writable.length) throw new Error(`agent 不是唯讀：tools=${tools.join(', ') || '（未宣告）'}`);

  const body = cleanLines(lines.slice(end + 1), notes);
  const out = [...lines.slice(0, end + 1), '', ...AGENT_PREAMBLE, ...body];
  return { text: out.join(eol) + eol, notes };
}

export function findResidue(text) {
  return RESIDUE_PATTERNS.filter((re) => re.test(text)).map((re) => re.source);
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function renderUpstream({ sha, date, notesByFile }) {
  const removed = Object.entries(notesByFile)
    .flatMap(([file, notes]) => notes.map((n) => `| \`${file}\` | ${n} |`))
    .join('\n');
  return `# 上游擷取紀錄

> 由 \`tools/sync-upstream.mjs\` 產生，**不要手改**；要調整擷取方式就改那支腳本後重跑。

| 項目 | 值 |
|---|---|
| 上游 | ${UPSTREAM_URL}（原 everything-claude-code，MIT License, Copyright (c) 2026 Affaan Mustafa） |
| commit | \`${sha}\` |
| 擷取日期 | ${date} |
| rules | ${LANGS.join('、')} → \`plugins/andy-init/skills/setup/payload/rules/\`（由 setup 裝到 \`~/.claude/rules/\`） |
| agents | ${AGENTS.join('、')} → \`plugins/andy-init/agents/\`（plugin 直接載入） |

## 與上游的差異

- rules 不帶 \`common/\`：通用層由 \`~/.claude/AGENTS.md\` 擔任；不帶 \`hooks.md\`：描述的是未安裝的 ECC hook。
- rules 保留 \`paths:\` frontmatter，只有碰到對應副檔名時才載入。
- agents 只收唯讀工具（${[...READ_ONLY_TOOLS].join('、')}）的審查者；有 Write/Edit 的一律不帶。
- agents 在 frontmatter 後加上本地前言：只審查不動手、以 AGENTS.md 為準、繁體中文回報。
- 逐項移除：

| 檔案 | 移除內容與原因 |
|---|---|
${removed}
`;
}

function parseArgs(argv) {
  const args = { src: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--src') args.src = argv[++i];
    else throw new Error(`未知參數：${argv[i]}`);
  }
  return args;
}

function syncRules(src, dest, notesByFile, failures) {
  fs.rmSync(dest, { recursive: true, force: true });
  for (const lang of LANGS) {
    const srcDir = path.join(src, 'rules', lang);
    if (!fs.existsSync(srcDir)) {
      failures.push(`上游沒有 rules/${lang}`);
      continue;
    }
    fs.mkdirSync(path.join(dest, lang), { recursive: true });
    for (const file of fs.readdirSync(srcDir).filter((f) => f.endsWith('.md')).sort()) {
      if (SKIP_RULE_FILES.has(file)) continue;
      const { text, notes } = transformRule(fs.readFileSync(path.join(srcDir, file), 'utf8'));
      record(`rules/${lang}/${file}`, text, notes, notesByFile, failures);
      fs.writeFileSync(path.join(dest, lang, file), text);
    }
  }
}

function syncAgents(src, dest, notesByFile, failures) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const name of AGENTS) {
    const file = path.join(src, 'agents', `${name}.md`);
    if (!fs.existsSync(file)) {
      failures.push(`上游沒有 agents/${name}.md`);
      continue;
    }
    try {
      const { text, notes } = transformAgent(fs.readFileSync(file, 'utf8'));
      record(`agents/${name}.md`, text, notes, notesByFile, failures);
      fs.writeFileSync(path.join(dest, `${name}.md`), text);
    } catch (err) {
      failures.push(`agents/${name}.md：${err.message}`);
    }
  }
}

function record(rel, text, notes, notesByFile, failures) {
  const residue = findResidue(text);
  if (residue.length) failures.push(`${rel} 仍殘留：${residue.join(', ')}`);
  if (notes.length) notesByFile[rel] = notes;
}

function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const pluginRoot = path.join(repoRoot, 'plugins/andy-init');
  const { src: givenSrc } = parseArgs(process.argv.slice(2));

  let src = givenSrc;
  let tmp = null;
  if (!src) {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-'));
    src = path.join(tmp, 'ECC');
    console.log(`clone ${UPSTREAM_URL} → ${src}`);
    execFileSync('git', ['clone', '--depth', '1', '-q', UPSTREAM_URL, src], { stdio: 'inherit' });
  }

  try {
    const sha = git(['rev-parse', 'HEAD'], src);
    const notesByFile = {};
    const failures = [];
    syncRules(src, path.join(pluginRoot, 'skills/setup/payload/rules'), notesByFile, failures);
    syncAgents(src, path.join(pluginRoot, 'agents'), notesByFile, failures);
    fs.writeFileSync(
      path.join(repoRoot, 'tools/UPSTREAM.md'),
      renderUpstream({ sha, date: new Date().toISOString().slice(0, 10), notesByFile }),
    );

    if (failures.length) {
      console.error('擷取失敗：\n' + failures.map((f) => `  - ${f}`).join('\n'));
      process.exitCode = 1;
      return;
    }
    console.log(`已同步上游 ${sha.slice(0, 7)}`);
    try {
      console.log(git(['status', '--short', '--', 'plugins', 'tools/UPSTREAM.md'], repoRoot) || '（與目前版本相同）');
    } catch {
      // 不在 git repo 裡時略過差異摘要
    }
  } finally {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function isEntryPoint() {
  try {
    return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  try {
    main();
  } catch (err) {
    console.error(err.stack || String(err));
    process.exitCode = 1;
  }
}
