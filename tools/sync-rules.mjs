#!/usr/bin/env node
// 從上游 ECC 擷取語言 rules，去除對 ECC skill / agent / common rules 的依賴後寫進 setup payload。
// 用法：node tools/sync-rules.mjs [--src <已 clone 的 ECC 目錄>]
// 省略 --src 時會 git clone --depth 1 到暫存目錄。擷取規則全部集中在本檔，不要手改 payload/rules。

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const UPSTREAM_URL = 'https://github.com/affaan-m/ECC';
export const LANGS = ['python', 'typescript', 'golang', 'rust', 'vue', 'web'];

// hooks.md 描述的是 ECC 的自動化 hook；不裝那些 hook 卻留著說明就是假旋鈕（AGENTS.md §6）。
export const SKIP_FILES = new Set(['hooks.md']);

const EXTENDS_LINE = /^> This file extends \[common\/[^\]]+\]\([^)]+\) with .*$/;
const EXTENDS_REPLACEMENT =
  '> 本檔延伸 `~/.claude/AGENTS.md`（跨專案通用規則）；兩者衝突時以 AGENTS.md 為準。';

// 逐行刪除：指向 ECC skill / hook 的引用，以及與 AGENTS.md 衝突的條目。
const DROP_LINES = [
  { re: /^See skill: .*$/, why: '指向 ECC skill' },
  { re: /^- ECC skills: .*$/, why: '指向 ECC skill' },
  { re: /^\d+\. Use ECC design\/frontend skills where relevant\.$/, why: '指向 ECC skill' },
  { re: /^- See hooks for automatic detection$/, why: '指向未安裝的 ECC hook' },
  { re: /^- Target 80%\+ line coverage$/, why: '覆蓋率硬指標與 AGENTS.md §1「證據優先於綠燈」衝突' },
];

// 整段刪除（標題到下一個同級標題）：ECC agent 推薦。
const DROP_SECTIONS = [{ heading: /^## Agent Support\s*$/, why: '推薦 ECC agent' }];

// 殘留檢查：轉換後仍出現就視為擷取規則漏網，直接失敗而不是默默寫出。
export const RESIDUE_PATTERNS = [
  /See skill:/,
  /\bECC\b/,
  /\]\(\.\.\/common\//,
  /## Agent Support/,
  /security-reviewer|e2e-runner|tdd-guide|code-reviewer/,
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

/** 轉換單一 rule 檔。回傳新內容與被移除項目的說明。 */
export function transformRule(text) {
  const notes = [];
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  let lines = text.split(/\r?\n/);

  lines = lines.map((line) => (EXTENDS_LINE.test(line) ? EXTENDS_REPLACEMENT : line));
  lines = lines.filter((line) => {
    const rule = DROP_LINES.find((d) => d.re.test(line));
    if (rule) notes.push(`刪除「${line.trim()}」：${rule.why}`);
    return !rule;
  });
  lines = dropSections(lines, notes);
  lines = collapseBlankLines(dropEmptySections(lines));

  return { text: lines.join(eol) + eol, notes };
}

export function findResidue(text) {
  return RESIDUE_PATTERNS.filter((re) => re.test(text)).map((re) => re.source);
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function renderReadme({ sha, date, langs, notesByFile }) {
  const removed = Object.entries(notesByFile)
    .flatMap(([file, notes]) => notes.map((n) => `| \`${file}\` | ${n} |`))
    .join('\n');
  return `# 語言 rules

> 由 \`tools/sync-rules.mjs\` 產生，**不要手改**；要調整擷取方式就改那支腳本後重跑。

| 項目 | 值 |
|---|---|
| 上游 | ${UPSTREAM_URL}（原 everything-claude-code，MIT License, Copyright (c) 2026 Affaan Mustafa） |
| commit | \`${sha}\` |
| 擷取日期 | ${date} |
| 語言 | ${langs.join('、')} |

每個檔案開頭的 \`paths:\` frontmatter 保留原樣：只有碰到對應副檔名時才會載入。

## 與上游的差異

- 不帶 \`common/\`：通用層由 \`~/.claude/AGENTS.md\` 擔任。
- 不帶 \`hooks.md\`：描述的是未安裝的 ECC 自動化 hook。
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

function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dest = path.join(repoRoot, 'plugins/andy-init/skills/setup/payload/rules');
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
    const date = new Date().toISOString().slice(0, 10);
    const notesByFile = {};
    const failures = [];

    fs.rmSync(dest, { recursive: true, force: true });
    for (const lang of LANGS) {
      const srcDir = path.join(src, 'rules', lang);
      if (!fs.existsSync(srcDir)) {
        failures.push(`上游沒有 rules/${lang}`);
        continue;
      }
      fs.mkdirSync(path.join(dest, lang), { recursive: true });
      for (const file of fs.readdirSync(srcDir).filter((f) => f.endsWith('.md')).sort()) {
        if (SKIP_FILES.has(file)) continue;
        const { text, notes } = transformRule(fs.readFileSync(path.join(srcDir, file), 'utf8'));
        const rel = `${lang}/${file}`;
        const residue = findResidue(text);
        if (residue.length) failures.push(`${rel} 仍殘留：${residue.join(', ')}`);
        if (notes.length) notesByFile[rel] = notes;
        fs.writeFileSync(path.join(dest, lang, file), text);
      }
    }
    fs.writeFileSync(path.join(dest, 'README.md'), renderReadme({ sha, date, langs: LANGS, notesByFile }));

    if (failures.length) {
      console.error('擷取失敗：\n' + failures.map((f) => `  - ${f}`).join('\n'));
      process.exitCode = 1;
      return;
    }
    console.log(`已寫入 ${dest}（上游 ${sha.slice(0, 7)}）`);
    try {
      console.log(git(['status', '--short', '--', dest], repoRoot) || '（與目前版本相同）');
    } catch {
      // 不在 git repo 裡時略過差異摘要
    }
  } finally {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch (err) {
    console.error(err.stack || String(err));
    process.exitCode = 1;
  }
}
