/**
 * 本地版本快照：秒级回滚的机制。
 *
 * 每次升级前，把 dsh 安装目录完整复制到用户数据目录下的版本键控快照里（存于
 * ~/.dsh/dsh-versions/snapshots/<version>/）。回滚就是把这棵树复制回安装目录——
 * 纯本地文件操作，不依赖 npm、不需要网络，通常数秒完成。
 *
 * 安全不变量（受 SuCriss/dsh-version-update 快照设计启发，代码为本项目原创）：
 * - 每个快照目录必须带 meta.json（version + at）；读取侧先校验元数据与 package.json，
 *   半途复制的残缺快照一律视为不可用，绝不覆盖可用安装。
 * - 创建走「临时目录 + 完成后 rename」，崩溃不会留下会被误信任的半成品。
 * - 回滚先「把现目录改名让开」，复制成功后再删旧目录；复制失败自动把原目录挪回来，
 *   让机器继续运行它原本在跑的代码。
 * - 修剪：优先清损坏快照，再按保留数清最旧的健康快照。
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseVersion } from './compare.js'

/** 默认快照根目录（用户数据目录，位于会被升级替换的包目录之外）。 */
export function defaultSnapshotsDir(deps = {}) {
	return join(deps.home ?? homedir(), '.dsh', 'dsh-versions', 'snapshots')
}

/** 是否一个合法的版本目录名（快照按精确版本号命名）。 */
const isVersionName = (name) => typeof name === 'string' && parseVersion(name) !== null

/** 读一个快照目录的 meta.json（损坏返回空对象）。 */
function readMeta(dir) {
	try {
		const raw = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'))
		return {
			...(typeof raw?.version === 'string' ? { version: raw.version } : {}),
			...(typeof raw?.at === 'number' ? { at: raw.at } : {}),
		}
	} catch {
		return {}
	}
}

/**
 * 一个目录是否可信地保存了某版本的快照：meta 完整、package.json 存在、
 * 且目录名 / meta / package.json 三方版本一致。
 */
export function isValidSnapshot(dir, version) {
	if (!existsSync(join(dir, 'package.json')) || !existsSync(join(dir, 'meta.json'))) return false
	const meta = readMeta(dir)
	if (meta.version !== version || meta.at === undefined) return false
	try {
		const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
		return pkg?.name === '@deepseek-ai/dsh' && pkg?.version === version
	} catch {
		return false
	}
}

/** 列出已存快照（新→旧）。损坏目录仍列出并标 usable=false，不静默隐藏。 */
export function listSnapshots(snapshotsDir) {
	if (!existsSync(snapshotsDir)) return []
	let names = []
	try {
		names = readdirSync(snapshotsDir)
	} catch {
		return []
	}
	const out = []
	for (const name of names) {
		if (!isVersionName(name)) continue
		const dir = join(snapshotsDir, name)
		let st
		try {
			st = statSync(dir)
		} catch {
			continue
		}
		if (!st.isDirectory()) continue
		const meta = readMeta(dir)
		out.push({
			version: name,
			...(meta.at !== undefined ? { at: meta.at } : {}),
			usable: isValidSnapshot(dir, name),
		})
	}
	return out.sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
}

/** 删除某个版本的快照。 */
export function removeSnapshot(snapshotsDir, version) {
	if (!isVersionName(version)) return false
	const dir = join(snapshotsDir, version)
	if (!existsSync(dir)) return false
	rmSync(dir, { recursive: true, force: true })
	return true
}

/** 保留最多 keep 个健康快照；损坏的快照永远先清（留它只是纯磁盘浪费）。 */
export function pruneSnapshots(snapshotsDir, keep) {
	const limit = Math.max(1, Math.floor(keep))
	const entries = listSnapshots(snapshotsDir)
	const damaged = entries.filter((e) => !e.usable)
	const healthy = entries.filter((e) => e.usable).sort((a, b) => (a.at ?? 0) - (b.at ?? 0))
	const doomed = [...damaged, ...healthy.slice(0, Math.max(0, healthy.length - limit))]
	for (const entry of doomed) removeSnapshot(snapshotsDir, entry.version)
}

/**
 * 把安装目录快照为某版本。幂等：同版本已有健康快照则复用；
 * 同版本只有损坏快照则替换（损坏的毫无价值，留着会静默削弱回滚安全）。
 * 全程同步且尽力而为：升级前立即调用，绝不因快照失败而阻塞升级。
 */
export function createSnapshot(deps) {
	const { installDir, snapshotsDir, version } = deps
	if (!isVersionName(version)) return { ok: false, error: `拒绝为 ${JSON.stringify(String(version))} 建快照：不是精确版本号` }
	const dest = join(snapshotsDir, version)
	if (isValidSnapshot(dest, version)) return { ok: true, reused: true }
	try {
		mkdirSync(snapshotsDir, { recursive: true })
		rmSync(dest, { recursive: true, force: true })
		const temp = join(snapshotsDir, `.tmp-${version}-${process.pid}-${Date.now()}`)
		cpSync(installDir, temp, { recursive: true })
		writeFileSync(join(temp, 'meta.json'), `${JSON.stringify({ version, at: (deps.now ?? Date.now)() })}\n`, 'utf8')
		renameSync(temp, dest)
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) }
	}
	pruneSnapshots(snapshotsDir, deps.keep ?? 5)
	return { ok: true }
}

/**
 * 从快照恢复安装目录。把现目录改名让开（同卷 rename 原子），复制成功后再删；
 * 复制失败则把原目录挪回，保持机器仍在跑它原来的代码。恢复后 RUNNING 进程仍执行旧代码，
 * 需重启宿主才生效（与正向升级相同，走同一个 needsRestart 流）。
 */
export function restoreSnapshot(deps) {
	const { installDir, snapshotsDir, version } = deps
	if (!isVersionName(version)) return { ok: false, error: `拒绝恢复 ${JSON.stringify(String(version))}：不是精确版本号` }
	const source = join(snapshotsDir, version)
	if (!isValidSnapshot(source, version)) return { ok: false, error: `没有可用的 ${version} 快照` }
	const aside = `${installDir}.replaced-${process.pid}-${Date.now()}`
	let moved = false
	try {
		renameSync(installDir, aside)
		moved = true
	} catch {
		// 有句柄拒绝改名（打开的 watcher/扫描），退回直接覆盖：cpSync 逐文件写，不需要谁许可。
	}
	try {
		cpSync(source, installDir, { recursive: true })
	} catch (error) {
		if (moved) {
			try {
				rmSync(installDir, { recursive: true, force: true })
				renameSync(aside, installDir)
			} catch {}
		}
		return { ok: false, error: error instanceof Error ? error.message : String(error) }
	}
	if (moved) rmSync(aside, { recursive: true, force: true })
	return { ok: true }
}
