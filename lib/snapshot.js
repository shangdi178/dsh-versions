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
 * - 创建走「临时目录 + 校验 + 完成后 rename」，崩溃不会留下会被误信任的半成品。
 * - 复制后**校验文件集合与大小**：复制中断/截断不会产出被信任的快照；替换旧快照前
 *   先完成校验，复制失败时既有健康快照仍保留。
 * - 恢复先复制到安装目录旁的暂存目录并校验，再「旧目录让开 → 暂存目录换入」两次
 *   rename；改名被占用句柄拒绝时**放弃恢复、原安装分毫不动**，绝不就地覆盖生成
 *   新旧混合目录。恢复失败会尽力把原目录换回。
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

/** 临时目录前缀：`.tmp-<version>-<pid>-<ts>`；崩溃残留靠前缀识别清理。 */
const TMP_PREFIX = '.tmp-'

/** 递归列出目录下的文件及大小（相对路径 → 字节数），用于复制完整性校验。 */
function listTree(dir, base = dir, out = new Map()) {
	let entries
	try {
		entries = readdirSync(dir, { withFileTypes: true })
	} catch {
		return out
	}
	for (const entry of entries) {
		const p = join(dir, entry.name)
		if (entry.isDirectory()) {
			listTree(p, base, out)
			continue
		}
		try {
			out.set(p.slice(base.length + 1).replace(/\\/gu, '/'), statSync(p).size)
		} catch {}
	}
	return out
}

/** 两棵树是否逐文件一致（集合 + 大小）。 */
function sameTree(a, b) {
	if (a.size !== b.size) return false
	for (const [path, size] of a) {
		if (b.get(path) !== size) return false
	}
	return true
}

/** 清理崩溃残留的 .tmp-* 半成品（只在创建快照时顺手做，不额外起扫描）。 */
function cleanupTempDirs(snapshotsDir) {
	let names
	try {
		names = readdirSync(snapshotsDir)
	} catch {
		return
	}
	for (const name of names) {
		if (!name.startsWith(TMP_PREFIX)) continue
		try {
			rmSync(join(snapshotsDir, name), { recursive: true, force: true })
		} catch {}
	}
}

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
	mkdirSync(snapshotsDir, { recursive: true })
	cleanupTempDirs(snapshotsDir)
	const temp = join(snapshotsDir, `${TMP_PREFIX}${version}-${process.pid}-${Date.now()}`)
	try {
		rmSync(temp, { recursive: true, force: true })
		cpSync(installDir, temp, { recursive: true })
		// 完整性校验：复制中断/截断不得产出「看起来健康」的快照
		const source = listTree(installDir)
		const copied = listTree(temp)
		if (!sameTree(source, copied)) {
			rmSync(temp, { recursive: true, force: true })
			return { ok: false, error: `快照复制不完整（源 ${source.size} 个文件，复制 ${copied.size} 个），已放弃本次快照` }
		}
		writeFileSync(join(temp, 'meta.json'), `${JSON.stringify({ version, at: (deps.now ?? Date.now)() })}\n`, 'utf8')
		// 先校验通过再替换旧快照：复制失败时既有健康快照仍在
		rmSync(dest, { recursive: true, force: true })
		renameSync(temp, dest)
	} catch (error) {
		rmSync(temp, { recursive: true, force: true })
		return { ok: false, error: error instanceof Error ? error.message : String(error) }
	}
	pruneSnapshots(snapshotsDir, deps.keep ?? 5)
	return { ok: true }
}

/**
 * 从快照恢复安装目录。
 *
 * 步骤：快照 → 同卷暂存目录（校验文件集合/大小）→ 现目录改名让开 → 暂存目录 rename
 * 换入 → 校验 → 删旧目录。全程没有「把快照直接覆盖到现目录」的步骤：
 *  - 暂存复制失败：原安装分毫未动；
 *  - 现目录改名被占用句柄拒绝：放弃恢复、原安装分毫未动（绝不就地覆盖生成混合目录）；
 *  - 换入失败：尽力把原目录 rename 回来，并在错误信息里说明原目录位置。
 *
 * 恢复后 RUNNING 进程仍执行旧代码，需重启宿主才生效（与正向升级相同，走同一个 needsRestart 流）。
 */
export function restoreSnapshot(deps) {
	const { installDir, snapshotsDir, version } = deps
	if (!isVersionName(version)) return { ok: false, error: `拒绝恢复 ${JSON.stringify(String(version))}：不是精确版本号` }
	const source = join(snapshotsDir, version)
	if (!isValidSnapshot(source, version)) return { ok: false, error: `没有可用的 ${version} 快照` }
	const expected = listTree(source)
	if (!expected.has('package.json')) return { ok: false, error: `快照 ${version} 内容不完整（缺少 package.json）` }
	const stamp = `${process.pid}-${Date.now()}`
	const stage = `${installDir}.staged-${stamp}`
	const aside = `${installDir}.replaced-${stamp}`

	// 1) 先做同卷暂存副本并校验；此步失败原安装完全不受影响
	try {
		rmSync(stage, { recursive: true, force: true })
		cpSync(source, stage, { recursive: true })
		const staged = listTree(stage)
		if (!sameTree(expected, staged)) {
			rmSync(stage, { recursive: true, force: true })
			return { ok: false, error: `暂存副本不完整（期望 ${expected.size} 个文件，实得 ${staged.size} 个），已放弃恢复（原安装未改动）` }
		}
	} catch (error) {
		rmSync(stage, { recursive: true, force: true })
		return { ok: false, error: `无法准备恢复副本，已放弃恢复（原安装未改动）：${error instanceof Error ? error.message : String(error)}` }
	}

	// 2) 原目录让开；rename 失败 = 无法安全替换 → 放弃，绝不就地覆盖
	try {
		renameSync(installDir, aside)
	} catch (error) {
		rmSync(stage, { recursive: true, force: true })
		return { ok: false, error: `安装目录被占用，无法安全替换（原安装未改动）：${error instanceof Error ? error.message : String(error)}。请停止 dsh 后重试` }
	}

	// 3) 暂存目录原子换入；失败则把原目录换回
	try {
		renameSync(stage, installDir)
		const final = listTree(installDir)
		if (!sameTree(expected, final)) {
			throw new Error(`恢复后校验不一致（期望 ${expected.size} 个文件，实得 ${final.size} 个）`)
		}
	} catch (error) {
		let restored = false
		try {
			rmSync(installDir, { recursive: true, force: true })
			renameSync(aside, installDir)
			restored = true
		} catch {}
		rmSync(stage, { recursive: true, force: true })
		return {
			ok: false,
			error: `恢复失败${restored ? '（原安装已还原）' : `（原安装保留在 ${aside}，请手动移回）`}：${error instanceof Error ? error.message : String(error)}`,
		}
	}
	rmSync(aside, { recursive: true, force: true })
	return { ok: true }
}
