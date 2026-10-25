'use strict';
// 任务 14-3-2：迁移工具主逻辑（ps1 包装器只负责调用本文件）。
//
//   node scripts/migration/migrate.cjs --from http://旧版 --to http://桌面版 \
//        [--dry-run] [--out 报告目录] [--verify]
//
// 设计原则（14-3-0）：
//   1. 旧库只读：对 -From 只发 GET /api/projects 与 GET /api/projects/{p}/backup。
//   2. 迁移是复制：不删除、不修改旧库任何东西。
//   3. 复用备份格式：桌面版侧用 POST /api/backups/restore。
//   4. 每个项目核对（14-3-3 往返比较），失败 → 非零退出码。
//   5. 可重复运行：同名且内容一致 → 跳过，标「已迁移」。
//
// --verify：只核对不恢复（用于失败路径演练：篡改桌面版测试库后重跑核对）。

const fs = require('node:fs');
const path = require('node:path');
const { getJson, putJson, download, postZip, trimSlash, ApiError } = require('./api.cjs');
const { parseManifest } = require('./zip.cjs');
const { normalizeManifest, diffCanonical } = require('./normalize.cjs');
const { candidates, freeName, serviceAddress } = require('./targets.cjs');

const LIMIT_HINT = /MiB|MB|大小|上限|超过/;

function usage(code) {
  console.error(
    '用法：node scripts/migration/migrate.cjs --from http://127.0.0.1:8086 --to http://127.0.0.1:17861 [--dry-run] [--out 目录] [--verify]'
  );
  process.exit(code);
}

function parseArgs(argv) {
  const args = { dryRun: false, verify: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from') args.from = argv[++i];
    else if (a === '--to') args.to = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--verify') args.verify = true;
    else usage(2);
  }
  if (!args.from || !args.to) usage(2);
  return args;
}

function safeFilename(name) {
  let cleaned = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_');
  if (cleaned.length > 80) cleaned = cleaned.slice(0, 80);
  return cleaned;
}

function countsOf(manifest) {
  const t = manifest.tables;
  return {
    datasets: t.datasets.length,
    dataset_versions: t.dataset_versions.length,
    charts: t.charts.length,
    chart_versions: t.chart_versions.length,
    experiments: t.experiments.length,
    experiment_dataset_links: t.experiment_datasets.length,
    style_templates: t.style_templates.length,
  };
}

/** 从备份里取出项目名/描述/归档状态（不需要解析整个 manifest 也能拿到）。 */
function projectRowOf(manifest) {
  return manifest.project || {};
}

function isLimitError(e) {
  return e instanceof ApiError && (e.status === 400 || e.status === 413) && LIMIT_HINT.test(e.message);
}

async function main() {
  const args = parseArgs(process.argv);
  const from = trimSlash(args.from);
  const to = trimSlash(args.to);
  if (serviceAddress(from) === serviceAddress(to)) {
    console.error('错误：-From 与 -To 指向同一个服务，无法迁移。');
    process.exitCode = 2;
    return;
  }

  // ---- 两端检查 ----
  let oldProjects;
  try {
    oldProjects = await getJson(from, '/api/projects');
    if (!Array.isArray(oldProjects)) throw new Error('GET /api/projects 返回的不是数组');
  } catch (e) {
    console.error(`错误：旧版 ${from} 不可用（GET /api/projects：${e.message}）。先启动旧版再运行迁移。`);
    process.exitCode = 2;
    return;
  }
  try {
    const ping = await getJson(to, '/api/desktop/ping');
    if (!ping || !ping.instance_id) throw new Error('响应缺少 instance_id');
  } catch (e) {
    console.error(
      `错误：桌面版 ${to} 不可用（GET /api/desktop/ping：${e.message}）。先启动桌面版再运行迁移。`
    );
    process.exitCode = 2;
    return;
  }

  const startedAt = new Date();
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 17);
  const reportDir = path.resolve(args.out || path.join('.runtime', `migration-${stamp}`));
  fs.mkdirSync(reportDir, { recursive: true });
  const mode = args.dryRun ? 'DryRun' : args.verify ? 'Verify' : 'Migrate';

  console.log(`迁移模式：${mode}`);
  console.log(`旧版（只读）：${from}`);
  console.log(`桌面版：${to}`);
  console.log(`报告目录：${reportDir}`);
  console.log(`共 ${oldProjects.length} 个项目（含已归档）。`);

  const results = [];
  let index = 0;
  for (const project of oldProjects) {
    index += 1;
    const label = `[${index}/${oldProjects.length}] ${project.name}`;
    const result = {
      name: project.name,
      source_id: project.id,
      result: '失败',
      target_id: null,
      target_name: null,
      counts: { source: null, target: null },
      diffs: [],
      note: null,
      backup_file: null,
    };
    results.push(result);
    try {
      await migrateProject({ from, to, project, result, reportDir, index, args, label });
    } catch (e) {
      result.result = '失败';
      result.note = `迁移过程异常：${e.message}`;
    }
    const tag =
      result.result === '成功' || result.result === '已迁移'
        ? '✔'
        : result.result === '跳过：过大'
          ? '⏭'
          : result.result === '干跑'
            ? '·'
            : '✘';
    console.log(`${tag} ${label} → ${result.result}${result.note ? '（' + result.note + '）' : ''}`);
  }

  // ---- 报告 ----
  const summary = {
    from,
    to,
    mode,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    projects: results,
    footer: {
      assistant_history_note: '助手的运行记录和会话不随迁移保留（桌面方案既定范围，备份格式不含 agent_runs/agent_sessions）。',
      old_db_untouched_note: '旧库没有被修改过：本工具对旧版只调用 GET /api/projects 和 GET /api/projects/{p}/backup。',
    },
  };
  const reportJson = path.join(reportDir, 'migration-report.json');
  fs.writeFileSync(reportJson, JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(reportDir, 'migration-report.md'), renderMarkdown(summary));

  const failed = results.filter((r) => r.result === '失败').length;
  const migrated = results.filter((r) => r.result === '已迁移').length;
  const skipped = results.filter((r) => r.result === '跳过：过大').length;
  const dry = results.filter((r) => r.result === '干跑').length;
  const ok = results.filter((r) => r.result === '成功').length;
  console.log('');
  console.log(`结果：成功 ${ok}，已迁移 ${migrated}，跳过：过大 ${skipped}，干跑 ${dry}，失败 ${failed}。`);
  console.log(`报告：${reportJson}`);
  // 不用 process.exit：Windows 下立刻退出会在 undici 连接池清理时触发 libuv 断言；
  // 设置 exitCode 后自然退出已实测可靠（错误码保留）。
  process.exitCode = failed > 0 ? 1 : 0;
}

async function migrateProject({ from, to, project, result, reportDir, index, args, label }) {
  // 1. 导出备份（保留在报告目录，本身就是离线副本）。
  const backupFile = path.join(reportDir, `${String(index).padStart(3, '0')}-${safeFilename(project.name)}.labflow.zip`);
  const zipBytes = await download(from, `/api/projects/${project.id}/backup`, backupFile);
  result.backup_file = path.relative(process.cwd(), backupFile).replace(/\\/g, '/');
  const manifestA = parseManifest(zipBytes);
  result.counts.source = countsOf(manifestA);
  const sourceProject = projectRowOf(manifestA);
  const wantArchived = sourceProject.archived === true;

  // 2. 预检查（用桌面版的 preview 接口，顺带走一遍真实的大小上限）。
  let preview;
  try {
    preview = await postZip(to, '/api/backups/preview', zipBytes);
  } catch (e) {
    if (isLimitError(e)) {
      result.result = '跳过：过大';
      result.note = `备份超过桌面版上限（${e.message}）。建议：在旧版里拆分或精简该项目后重新迁移；本次导出的备份文件已保存在报告目录，可以之后单独恢复。`;
      return;
    }
    result.note = `预检查失败：${e.message}`;
    return;
  }

  if (args.dryRun) {
    result.result = '干跑';
    result.note = 'DryRun：仅导出与预检查，未恢复。';
    return;
  }

  // 3. Both migrate and verify resolve the same candidates and rename rules.
  const projects = await getJson(to, '/api/projects');
  if (!Array.isArray(projects)) throw new Error('桌面项目列表格式错误');
  const targetName = freeName(projects, project.name);
  let reused = null;
  let reusedCounts = null;
  let mismatch = null;
  for (const { project: existing, index: suffix } of candidates(projects, project.name)) {
    const zipExisting = await download(to, `/api/projects/${existing.id}/backup`);
    const manifestExisting = parseManifest(zipExisting);
    // 候选名与源名不同（「（迁移）」后缀）时，项目名差异按已知重命名处理，比较其余内容。
    const diffs =
      suffix === 0
        ? compareManifests(manifestA, manifestExisting)
        : compareManifests(manifestA, manifestExisting, '__RENAMED__');
    if (diffs.length === 0) {
      reused = existing;
      reusedCounts = countsOf(manifestExisting);
      break;
    }
    mismatch = { existing, counts: countsOf(manifestExisting), diffs };
  }

  if (args.verify) {
    const target = reused || mismatch?.existing;
    if (!target) { result.note = '核对模式：桌面版没有原名或迁移副本。'; return; }
    result.target_id = target.id;
    result.target_name = target.name;
    result.counts.target = reused ? reusedCounts : mismatch.counts;
    if (reused) result.result = '已迁移';
    else { result.diffs = mismatch.diffs; result.note = '核对模式：内容不一致。'; }
    return;
  }

  if (reused) {
    result.result = '已迁移';
    result.target_id = reused.id;
    result.target_name = reused.name;
    result.counts.target = reusedCounts;
    result.note = '桌面版已有内容一致的同名项目，跳过恢复。';
    await syncArchivedState(to, reused, wantArchived, project, result);
    return;
  }

  // 4. 恢复（复用现有备份恢复接口）。
  const restored = await postZip(to, '/api/backups/restore', zipBytes, { name: targetName });
  result.target_id = restored.id;
  result.target_name = restored.name || targetName;

  // 5. 恢复原归档状态（用现有项目更新接口，不改 restore() 语义）。
  await syncArchivedState(to, { id: restored.id, archived: false }, wantArchived, project, result);

  // 6. 核对（14-3-3：导出 B → 规范化 → 比较）。换名恢复时项目名差异按已知重命名处理。
  const zipB = await download(to, `/api/projects/${restored.id}/backup`);
  const manifestB = parseManifest(zipB);
  result.counts.target = countsOf(manifestB);
  const renamed = targetName !== project.name;
  const diffs = compareManifests(manifestA, manifestB, renamed ? '__RENAMED__' : undefined);
  if (diffs.length === 0) {
    result.result = '成功';
  } else {
    result.result = '失败';
    result.diffs = diffs;
    result.note = '往返比较发现差异。';
  }
}

function compareManifests(a, b, nameOverride) {
  // nameOverride：换名恢复（「（迁移）」）时，项目名差异是刻意为之，两边统一成哨兵再比内容。
  if (nameOverride != null) {
    a = { ...a, project: { ...a.project, name: nameOverride } };
    b = { ...b, project: { ...b.project, name: nameOverride } };
  }
  return diffCanonical(normalizeManifest(a), normalizeManifest(b));
}

/** restore() 一律建非归档项目；源项目是归档的就补一次 PUT（现有接口）。 */
async function syncArchivedState(to, target, wantArchived, sourceProjectRow, result) {
  const currentArchived = target.archived === true;
  if (wantArchived === currentArchived) return;
  await putJson(to, `/api/projects/${target.id}`, {
    name: result.target_name || sourceProjectRow.name,
    description: sourceProjectRow.description == null ? '' : sourceProjectRow.description,
    archived: wantArchived,
  });
  if (result.note) result.note += ' 已按源项目恢复归档状态。';
  else result.note = '已按源项目恢复归档状态。';
}

function renderMarkdown(summary) {
  const lines = [];
  lines.push('# FigTide 旧版 → 桌面版 迁移报告');
  lines.push('');
  lines.push(`- 模式：**${summary.mode}**（DryRun = 只导出和预检查；Verify = 只核对；Migrate = 正式迁移）`);
  lines.push(`- 旧版（只读）：${summary.from}`);
  lines.push(`- 桌面版：${summary.to}`);
  lines.push(`- 时间：${summary.finished_at}`);
  lines.push('');
  const cell = (n) => (n === null || n === undefined ? '—' : String(n));
  lines.push('| # | 项目名 | 结果 | 数据集(旧/新) | 数据版本(旧/新) | 图表(旧/新) | 图表版本(旧/新) | 实验(旧/新) | 实验链接(旧/新) | 样式模板(旧/新) |');
  lines.push('|---|--------|------|----------------|------------------|------------|----------------|------------|------------------|------------------|');
  summary.projects.forEach((r, i) => {
    const s = r.counts.source || {};
    const t = r.counts.target || {};
    lines.push(
      `| ${i + 1} | ${mdEscape(r.name)} | ${r.result} | ${cell(s.datasets)}/${cell(t.datasets)} | ${cell(s.dataset_versions)}/${cell(t.dataset_versions)} | ${cell(s.charts)}/${cell(t.charts)} | ${cell(s.chart_versions)}/${cell(t.chart_versions)} | ${cell(s.experiments)}/${cell(t.experiments)} | ${cell(s.experiment_dataset_links)}/${cell(t.experiment_dataset_links)} | ${cell(s.style_templates)}/${cell(t.style_templates)} |`
    );
  });
  lines.push('');
  const problems = summary.projects.filter((r) => r.result === '失败' || r.result === '跳过：过大');
  if (problems.length > 0) {
    lines.push('## 需要关注的项目');
    lines.push('');
    for (const r of problems) {
      lines.push(`### ${mdEscape(r.name)} — ${r.result}`);
      if (r.note) lines.push(`- ${r.note}`);
      for (const d of r.diffs || []) lines.push(`- 差异：\`${mdEscape(d)}\``);
      lines.push('');
    }
  }
  lines.push('## 说明');
  lines.push('');
  lines.push(`- ${summary.footer.assistant_history_note}`);
  lines.push(`- ${summary.footer.old_db_untouched_note}`);
  lines.push('');
  return lines.join('\n');
}

function mdEscape(text) {
  return String(text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

main().catch((e) => {
  console.error(`迁移工具异常退出：${e.stack || e.message}`);
  process.exitCode = 1;
});
