/**
 * dsh-versions — 插件兼容性检查。
 *
 * 原理（源自 0.1.2-rc.1 实测调查）：dsh 0.1.2 系列从 @deepseek-ai/dsh-settings
 * 删除了 settingsNamespace / installSettingsSection 导出，导致按 0.1.1 构建的
 * 第三方插件静态导入失败、插件树整体加载崩溃。这类不兼容可以静态检测：
 *  1. 拉取目标版本 @deepseek-ai/dsh-settings 的导出符号集（npm tarball，
 *     gzip + 最小 tar 解析提取 lib/index.js，正则解析 export 语句）
 *  2. 扫描每个已安装插件入口文件对 @deepseek-ai/dsh-settings 的具名导入
 *  3. 导入了目标版本不再提供的符号 → 标记不兼容
 *
 * 嵌套 dsh-settings 的版本与 dsh 主程序版本一致（0.1.1-rc.2/rc.2、
 * 0.1.2-rc.1/rc.1、0.1.2-alpha.4/alpha.4 均实测吻合）。
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { request as httpsRequest } from 'node:https'

const REGISTRY = 'https://registry.npmjs.org'
const SETTINGS_PKG = '@deepseek-ai/dsh-settings'
const UA = 'dsh-versions/0.5 (local dsh web instance)'
const COMPAT_TTL = 30 * 60_000

// ---------------------------------------------------------------------------
// registry tarball 下载 + 最小 tar 解析（零依赖）
// ---------------------------------------------------------------------------

function fetchBuffer(url, timeoutMs = 30_000) {
	return new Promise((resolve, reject) => {
		const req = httpsRequest(url, {
			method: 'GET',
			headers: { 'user-agent': UA, accept: '*/*' },
			timeout: timeoutMs,
		}, (res) => {
			if (res.statusCode >= 301 && res.statusCode <= 308 && typeof res.headers.location === 'string') {
				res.resume()
				fetchBuffer(res.headers.location, timeoutMs).then(resolve, reject)
				return
			}
			if (res.statusCode !== 200) {
				res.resume()
				reject(new Error(`HTTP ${res.statusCode}`))
				return
			}
			const chunks = []
			res.on('data', (chunk) => chunks.push(chunk))
			res.on('end', () => resolve(Buffer.concat(chunks)))
		})
		req.on('error', reject)
		req.on('timeout', () => req.destroy(new Error('registry 下载超时')))
		req.end()
	})
}

/** 从未压缩的 tar 缓冲里提取指定路径的文件内容；找不到返回 null。 */
export function extractFromTar(tarBuffer, wantedPath) {
	const offsetSize = 124
	const offsetType = 156
	let offset = 0
	while (offset + 512 <= tarBuffer.length) {
		const header = tarBuffer.subarray(offset, offset + 512)
		if (header.every((byte) => byte === 0)) break
		const rawName = header.subarray(0, 100)
		const nameEnd = rawName.indexOf(0)
		const name = header.subarray(0, nameEnd === -1 ? 100 : nameEnd).toString('utf8')
		const sizeField = header.subarray(offsetSize, offsetSize + 12).toString('utf8').replace(/\0[\s]*$/u, '').trim()
		const size = parseInt(sizeField, 8) || 0
		const type = String.fromCharCode(header[offsetType] || 0)
		const dataStart = offset + 512
		if (type === '0' || type === '\0') {
			if (name === wantedPath || name === './' + wantedPath || name.endsWith('/' + wantedPath)) {
				return tarBuffer.subarray(dataStart, dataStart + size).toString('utf8')
			}
		}
		offset = dataStart + Math.ceil(size / 512) * 512
	}
	return null
}

/** 解析 lib/index.js 的具名导出集合（含 `A as B` 取导出后的公开名）。 */
export function parseExportNames(source) {
	const names = new Set()
	for (const match of source.matchAll(/export\s*\{([^}]+)\}/gu)) {
		for (const raw of match[1].split(',')) {
			const part = raw.trim()
			if (part === '') continue
			const asMatch = part.match(/^([\w$]+)\s+as\s+([\w$]+)$/u)
			names.add(asMatch ? asMatch[2] : part)
		}
	}
	return names
}

const settingsExportsCache = new Map()
/** 目标版本 @deepseek-ai/dsh-settings 的导出符号集（30 分钟缓存）。 */
export async function fetchSettingsExports(version) {
	const hit = settingsExportsCache.get(version)
	if (hit !== undefined && Date.now() - hit.at < COMPAT_TTL) return hit
	const encoded = SETTINGS_PKG.replace('/', '%2F')
	const tgzUrl = `${REGISTRY}/${encoded}/-/${SETTINGS_PKG.split('/')[1]}-${version}.tgz`
	const gzipped = await fetchBuffer(tgzUrl)
	const tar = gunzipSync(gzipped)
	const source = extractFromTar(tar, 'package/lib/index.js')
	if (source === null) throw new Error('tarball 中未找到 lib/index.js')
	const names = parseExportNames(source)
	const row = { at: Date.now(), names }
	settingsExportsCache.set(version, row)
	return row
}

// ---------------------------------------------------------------------------
// 已安装插件扫描
// ---------------------------------------------------------------------------

/** 提取一个源文件里从 @deepseek-ai/dsh-settings 具名导入的符号集合。 */
export function scanSettingsImports(source) {
	const names = new Set()
	if (typeof source !== 'string') return names
	const patterns = [
		/import\s*\{([^}]*)\}\s*from\s*["']@deepseek-ai\/dsh-settings["']/gu,
		/export\s*\{([^}]*)\}\s*from\s*["']@deepseek-ai\/dsh-settings["']/gu,
	]
	for (const pattern of patterns) {
		for (const match of source.matchAll(pattern)) {
			for (const raw of match[1].split(',')) {
				const part = raw.trim()
				if (part === '') continue
				const asMatch = part.match(/^([\w$]+)\s+as\s+([\w$]+)$/u)
				names.add(asMatch ? asMatch[1] : part) // 导入侧取本地绑定前的原始名
			}
		}
	}
	return names
}

function pluginEntryFile(moduleName, baseUrl) {
	try {
		const require = createRequire(baseUrl ?? OWN_PKG)
		return require.resolve(`${moduleName}/package.json`)
	} catch {
		return null
	}
}

/**
 * 兼容性检查主入口：
 * 返回 { target, settingsVersion, incompatible: [{name, version, missing}], checkedAt, note? }
 */
export async function checkCompat(packages, target, baseUrl) {
	const settings = await fetchSettingsExports(target)
	const incompatible = []
	let scanned = 0
	for (const pkg of packages) {
		if (typeof pkg.name !== 'string' || pkg.name.startsWith('@deepseek-ai/')) continue
		const pkgPath = pluginEntryFile(pkg.name, baseUrl)
		if (pkgPath === null) continue
		let source = ''
		try {
			source = readFileSync(join(dirname(pkgPath), 'lib', 'index.js'), 'utf8')
		} catch {
			try { source = readFileSync(pkgPath.replace('package.json', 'index.js'), 'utf8') } catch {}
		}
		if (source === '') continue
		scanned += 1
		const imported = scanSettingsImports(source)
		const missing = [...imported].filter((name) => !settings.names.has(name))
		if (missing.length > 0) {
			incompatible.push({ name: pkg.name, version: pkg.version, missing })
		}
	}
	return {
		target,
		settingsVersion: target,
		scanned,
		incompatible,
		checkedAt: Date.now(),
	}
}
