/**
 * dsh-versions — 生态兼容垫片引擎。
 *
 * 垫片 = 把被新版 dsh 删除的旧 API 移植回框架文件，让按旧 API 构建的第三方
 * 插件（Web UI 套件、市场等）在新版框架上继续加载。
 *
 * 安全模式（与 snapshot.js 一致）：
 *  - 应用前备份原文件到 <dataDir>/shims/<id>/orig
 *  - 写后用 node --check 校验，失败自动还原
 *  - 幂等：目标文件带 marker 时直接复用
 *  - 可逆：移除 = 从 .orig 还原（或删除带标记的恢复目录）
 *  - 按版本系列适用：回滚到旧版本系列后 reconcile 会自动卸载垫片（避免与
 *    框架自带导出重复导致语法错误）
 *  - 启用集持久化在 <dataDir>/shims/enabled.json，boot 时 reconcile 自动重应用
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const MARKER_LEGACY_API = 'dsh-versions: legacy-settings-api shim'
const RESTORED_MARKER = '.dsh-versions-restored'
/** 0.1.2 系列移除了旧设置分区 API；垫片只对 0.1.2.x 适用。 */
const BREAKING_SERIES_PATTERN = /^0\.1\.2(?:[.\-+]|$)/u

// ---------------------------------------------------------------------------
// 垫片一：legacy-settings-api —— 恢复 dsh-settings 的 settingsNamespace /
// installSettingsSection 导出（实现逐行移植自 0.1.1-rc.2，内部符号加 dv 前缀，
// 以重命名导出对齐原公开名，零冲突风险）。
// ---------------------------------------------------------------------------

const LEGACY_API_BLOCK = [
	'/* ' + MARKER_LEGACY_API + ' — 由 dsh-versions 移植自 0.1.1-rc.2；删除本块并从 .orig 备份还原即卸载垫片 */',
	'const dvNamespacePattern = /^[a-z][a-z0-9-]*$/;',
	'const dvFiberDisposed = 4;',
	'const dvFiberUnloading = 5;',
	'function dvIsUnloading(ctx) {',
	'\tconst state = ctx.fiber.state;',
	'\treturn state === dvFiberUnloading || state === dvFiberDisposed;',
	'}',
	'function dvSettingsNamespace(value) {',
	'\tif (!dvNamespacePattern.test(value)) throw new TypeError("settings namespace \\"" + value + "\\" must match " + String(dvNamespacePattern));',
	'\treturn value;',
	'}',
	'function dvInstallSettingsSection(ctx, ns, schema, entry, hooks) {',
	'\tctx.inject(["settings"], (sctx) => {',
	'\t\tconst scope = sctx.settings.register(ns, schema, {',
	'\t\t\tbase: entry,',
	'\t\t\t...hooks.validate === void 0 ? {} : { validate: hooks.validate }',
	'\t\t});',
	'\t\thooks.setSource(() => scope.get());',
	'\t\tsctx.effect(() => () => {',
	'\t\t\tif (dvIsUnloading(ctx)) return;',
	'\t\t\thooks.setSource(() => entry);',
	'\t\t\thooks.onChange();',
	'\t\t});',
	'\t\thooks.onChange();',
	'\t\tscope.watch(() => {',
	'\t\t\tif (dvIsUnloading(ctx)) return;',
	'\t\t\thooks.onChange();',
	'\t\t});',
	'\t});',
	'}',
	'export { dvSettingsNamespace as settingsNamespace, dvInstallSettingsSection as installSettingsSection };',
].join('\n')

function legacyTargetFile(deps) {
	return join(deps.dshDir, 'node_modules', '@deepseek-ai', 'dsh-settings', 'lib', 'index.js')
}
function legacyOrigFile(deps) {
	return join(deps.dataDir, 'shims', 'legacy-settings-api', 'index.js.orig')
}
function legacyApplied(deps) {
	try {
		return readFileSync(legacyTargetFile(deps), 'utf8').includes(MARKER_LEGACY_API)
	} catch {
		return false
	}
}
function legacyApplicable(deps) {
	if (typeof deps.fwVersion !== 'string' || !BREAKING_SERIES_PATTERN.test(deps.fwVersion)) return false
	try {
		const content = readFileSync(legacyTargetFile(deps), 'utf8')
		// 框架自带同名导出（0.1.1 系列）时不需要垫片
		if (/export \{[^}]*settingsNamespace/u.test(content)) return false
		return content.includes('sctx.settings.register') || content.includes('export {')
	} catch {
		return false
	}
}

function applyLegacySettingsApi(deps) {
	const target = legacyTargetFile(deps)
	if (!existsSync(target)) return { ok: false, error: '目标文件不存在：' + target }
	const content = readFileSync(target, 'utf8')
	if (content.includes(MARKER_LEGACY_API)) return { ok: true, reused: true }
	if (/export \{[^}]*settingsNamespace/u.test(content)) {
		return { ok: false, error: '当前框架已自带 settingsNamespace 导出，无需垫片' }
	}
	const orig = legacyOrigFile(deps)
	mkdirSync(dirnameOf(orig), { recursive: true })
	writeFileSync(orig, content, 'utf8')
	const patched = content.replace(/\r?\n$/u, '') + '\n\n' + LEGACY_API_BLOCK + '\n'
	writeFileSync(target, patched, 'utf8')
	const check = syntaxCheck(target, deps)
	if (check !== null) {
		writeFileSync(target, content, 'utf8') // 校验失败自动还原
		return { ok: false, error: '垫片写入后语法校验失败（已还原）：' + check }
	}
	return { ok: true }
}

function removeLegacySettingsApi(deps) {
	const target = legacyTargetFile(deps)
	if (!existsSync(target)) return { ok: true }
	const content = readFileSync(target, 'utf8')
	if (!content.includes(MARKER_LEGACY_API)) return { ok: true }
	const orig = legacyOrigFile(deps)
	if (existsSync(orig)) {
		const original = readFileSync(orig, 'utf8')
		writeFileSync(target, original, 'utf8')
		const check = syntaxCheck(target, deps)
		if (check !== null) return { ok: false, error: '还原后语法校验失败：' + check }
		return { ok: true }
	}
	// 没有 .orig（异常情况）：至少剥掉垫片块，保住文件可用
	const stripped = content.split('/* ' + MARKER_LEGACY_API)[0].replace(/\n$/, '\n')
	writeFileSync(target, stripped, 'utf8')
	const check = syntaxCheck(target, deps)
	if (check !== null) return { ok: false, error: '剥离垫片块后语法校验失败：' + check }
	return { ok: true }
}

// ---------------------------------------------------------------------------
// 垫片二：restore-host-apiproxy —— 0.1.2 移除了 @deepseek-ai/dsh-host-apiproxy
// 包；dsh-remote-web-ui 只从它的 api/rpc 子路径导入 RpcId。从本地版本备份恢复
// 整个包目录即可满足。
// ---------------------------------------------------------------------------

function apiproxyTargetDir(deps) {
	return join(deps.dshDir, 'node_modules', '@deepseek-ai', 'dsh-host-apiproxy')
}
function apiproxyRestoredMarker(deps) {
	return join(apiproxyTargetDir(deps), RESTORED_MARKER)
}
function apiproxyApplied(deps) {
	return existsSync(apiproxyRestoredMarker(deps))
}
function apiproxyApplicable(deps) {
	if (typeof deps.fwVersion !== 'string' || !BREAKING_SERIES_PATTERN.test(deps.fwVersion)) return false
	if (existsSync(apiproxyTargetDir(deps))) return false
	return findApiproxyBackupSource(deps) !== null
}

/** 从 backups/ 里找最新的、含 dsh-host-apiproxy 的框架备份。 */
function findApiproxyBackupSource(deps) {
	const root = deps.backupRoot
	try {
		const stamps = readdirSync(root).sort().reverse()
		for (const stamp of stamps) {
			const candidate = join(root, stamp, 'dsh-package-backup', 'node_modules', '@deepseek-ai', 'dsh-host-apiproxy')
			if (existsSync(join(candidate, 'package.json'))) return candidate
		}
	} catch {}
	return null
}

function applyRestoreHostApiproxy(deps) {
	const target = apiproxyTargetDir(deps)
	if (existsSync(apiproxyRestoredMarker(deps))) return { ok: true, reused: true }
	if (existsSync(target)) return { ok: false, error: '目标目录已存在（非垫片副本），拒绝覆盖' }
	const source = findApiproxyBackupSource(deps)
	if (source === null) return { ok: false, error: '本地备份中找不到 dsh-host-apiproxy（需先在 0.1.1-rc.2 上升级一次以生成备份）' }
	copyTree(source, target)
	writeFileSync(join(target, RESTORED_MARKER), JSON.stringify({ at: (deps.now ?? Date.now)(), from: source }), 'utf8')
	if (!existsSync(join(target, 'package.json'))) {
		rmSync(target, { recursive: true, force: true })
		return { ok: false, error: '恢复后校验失败（package.json 缺失），已回退' }
	}
	return { ok: true }
}

function removeRestoreHostApiproxy(deps) {
	const target = apiproxyTargetDir(deps)
	if (!existsSync(target)) return { ok: true }
	if (!existsSync(apiproxyRestoredMarker(deps))) return { ok: false, error: '目标目录不是垫片恢复的副本，拒绝删除' }
	rmSync(target, { recursive: true, force: true })
	return { ok: true }
}

// ---------------------------------------------------------------------------
// 注册表 + 列表 + 应用/移除 + reconcile
// ---------------------------------------------------------------------------

const SHIM_DEFS = [
	{
		id: 'legacy-settings-api',
		name: '旧版设置分区 API 垫片',
		description: '在 dsh 0.1.2.x 上恢复被移除的 settingsNamespace / installSettingsSection 导出（实现移植自 0.1.1-rc.2），使按 0.1.1 构建的第三方插件（Web UI 套件等）正常加载。',
		applicable: legacyApplicable,
		applied: legacyApplied,
		apply: applyLegacySettingsApi,
		remove: removeLegacySettingsApi,
	},
	{
		id: 'restore-host-apiproxy',
		name: '恢复 dsh-host-apiproxy 包',
		description: 'dsh 0.1.2 移除了 @deepseek-ai/dsh-host-apiproxy；从本地版本备份恢复该包，使 dsh-remote-web-ui 等引用它的插件可加载。',
		applicable: apiproxyApplicable,
		applied: apiproxyApplied,
		apply: applyRestoreHostApiproxy,
		remove: removeRestoreHostApiproxy,
	},
]

function enabledFile(dataDir) {
	return join(dataDir, 'shims', 'enabled.json')
}
function readEnabled(dataDir) {
	try {
		const parsed = JSON.parse(readFileSync(enabledFile(dataDir), 'utf8'))
		return parsed && typeof parsed === 'object' ? parsed : {}
	} catch {
		return {}
	}
}
function setEnabled(dataDir, id, value) {
	const enabled = readEnabled(dataDir)
	enabled[id] = value
	mkdirSync(dirnameOf(enabledFile(dataDir)), { recursive: true })
	writeFileSync(enabledFile(dataDir), JSON.stringify(enabled, null, 2) + '\n', 'utf8')
}

function shimById(id) {
	return SHIM_DEFS.find((def) => def.id === id) ?? null
}

/** 单个垫片状态。 */
function shimStatus(def, deps) {
	const applicable = deps.fwVersion !== null && def.applicable(deps)
	const applied = def.applied(deps)
	return {
		id: def.id,
		name: def.name,
		description: def.description,
		applicable,
		applied,
		healthy: applied ? true : null,
	}
}

export function listShims(deps) {
	const enabled = readEnabled(deps.dataDir)
	return SHIM_DEFS.map((def) => {
		const status = shimStatus(def, deps)
		return { ...status, enabled: enabled[def.id] === true }
	})
}

export function applyShim(id, deps) {
	const def = shimById(id)
	if (def === null) return { ok: false, error: '未知垫片：' + id }
	setEnabled(deps.dataDir, id, true)
	const status = shimStatus(def, deps)
	if (status.applied) return { ok: true, reused: true }
	if (!status.applicable) return { ok: true, standby: true, message: '当前框架版本不需要此垫片，已记为启用（版本变化时自动生效）' }
	return def.apply(deps)
}

export function removeShim(id, deps) {
	const def = shimById(id)
	if (def === null) return { ok: false, error: '未知垫片：' + id }
	setEnabled(deps.dataDir, id, false)
	return def.remove(deps)
}

/**
 * 一致性整理（boot / 升级脚本 / CLI 共用）：
 *  - 已启用 + 适用 + 未应用 → 应用
 *  - 已启用 + 不适用 + 已应用 → 自动卸载（回滚到旧版本系列后防重复导出）
 *  - 未启用 + 已应用 → 卸载
 */
export function reconcileShims(deps) {
	const enabled = readEnabled(deps.dataDir)
	const results = []
	for (const def of SHIM_DEFS) {
		const isOn = enabled[def.id] === true
		const applied = def.applied(deps)
		try {
			if (isOn && !applied) {
				const r = def.apply(deps)
				results.push({ id: def.id, action: 'applied', ok: r.ok === true, reused: r.reused === true, error: r.error ?? null })
			} else if (!isOn && applied) {
				const r = def.remove(deps)
				results.push({ id: def.id, action: 'removed', ok: r.ok === true, error: r.error ?? null })
			}
		} catch (error) {
			results.push({ id: def.id, action: 'error', ok: false, error: error instanceof Error ? error.message : String(error) })
		}
	}
	return results
}

// ---------------------------------------------------------------------------
// 内部小件
// ---------------------------------------------------------------------------

function dirnameOf(p) {
	const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
	return idx === -1 ? p : p.slice(0, idx)
}

/** 自包含递归复制（与 snapshot.js 的复制策略一致；跳过 .git）。 */
function copyTree(src, dest) {
	mkdirSync(dest, { recursive: true })
	for (const entry of readdirSync(src, { withFileTypes: true })) {
		if (entry.name === '.git') continue
		const s = join(src, entry.name)
		const d = join(dest, entry.name)
		if (entry.isDirectory()) copyTree(s, d)
		else copyFileSync(s, d)
	}
}

/** 语法校验：返回 null 表示通过，否则返回错误消息。 */
function syntaxCheck(file, deps) {
	try {
		execFileSync(deps.nodePath ?? process.execPath, ['--check', file], { stdio: 'pipe' })
		return null
	} catch (error) {
		return error instanceof Error ? error.message.split('\n')[0] : String(error)
	}
}

export { SHIM_DEFS }
