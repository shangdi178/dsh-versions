/**
 * dsh-versions — 最简 dsh 版本管理（宿主端）。
 *
 * 提供环回 HTTP 路由（前缀 /dsh-versions）：
 *   GET /dsh-versions/state    dsh 主程序 + 全部已装插件的版本清单
 *   GET /dsh-versions/updates  并发查 npm registry 的 latest，返回可更新列表
 *
 * 纯只读：不安装、不升级、不改任何配置。仅允许本机访问；
 * 官方框架组件（@deepseek-ai/*）不做单独更新检查——它们随 dsh 主程序整体升级。
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { request as httpsRequest } from 'node:https'
import { compareVersions } from './compare.js'

/** Cordis 插件元信息。 */
export const name = 'dsh-versions'
export const inject = ['webServer', 'loader']

const ROUTE_PREFIX = '/dsh-versions'
const REGISTRY = 'https://registry.npmjs.org'
const FRAMEWORK_SCOPE = '@deepseek-ai/'
const UA = 'dsh-versions/0.1 (local dsh web instance)'
const PKG_META_TTL = 60_000
const UPDATES_TTL = 10 * 60_000
const UPDATES_TIMEOUT = 8_000

const OWN_PKG = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json')

// ---------------------------------------------------------------------------
// 包元信息（version / repository），60 秒 TTL。
// ---------------------------------------------------------------------------
const pkgMetaCache = new Map()
function pkgMeta(moduleName, baseUrl) {
	if (typeof moduleName !== 'string' || moduleName === '' || moduleName.startsWith('cordis:')) return null
	const hit = pkgMetaCache.get(moduleName)
	if (hit !== undefined && Date.now() - hit.at < PKG_META_TTL) return hit
	const meta = { at: Date.now(), version: null, repository: null }
	try {
		const require = createRequire(baseUrl ?? OWN_PKG)
		const pkg = JSON.parse(readFileSync(require.resolve(`${moduleName}/package.json`), 'utf8'))
		meta.version = typeof pkg.version === 'string' ? pkg.version : null
		const raw = typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository?.url ?? null)
		if (typeof raw === 'string') meta.repository = raw.replace(/^git\+/u, '').replace(/\.git$/u, '')
	} catch {}
	pkgMetaCache.set(moduleName, meta)
	return meta
}

/** dsh 主程序版本：优先宿主提供的 baseUrl，失败则回退插件自身目录解析。 */
function frameworkVersion(baseUrl) {
	for (const base of [baseUrl, OWN_PKG]) {
		if (!base) continue
		try {
			const require = createRequire(base)
			const pkg = JSON.parse(readFileSync(require.resolve('@deepseek-ai/dsh/package.json'), 'utf8'))
			if (typeof pkg.version === 'string') return pkg.version
		} catch {}
	}
	return null
}

/** 当前 profile 的组件清单：去重、跳过 cordis 内部行与无版本的行。 */
function listPackages(ctx) {
	const seen = new Set()
	const packages = []
	for (const entry of ctx.loader.entries()) {
		if (entry.options?.group) continue
		const name = entry.options?.name
		if (typeof name !== 'string' || name === '' || name.startsWith('cordis:') || seen.has(name)) continue
		seen.add(name)
		const meta = pkgMeta(name, ctx.baseUrl)
		if (meta === null || meta.version === null) continue
		packages.push({ name, version: meta.version, repository: meta.repository })
	}
	packages.sort((a, b) => a.name.localeCompare(b.name))
	return packages
}

// ---------------------------------------------------------------------------
// npm registry 查询
// ---------------------------------------------------------------------------

/** 查询一个包在 npm 上的 latest 版本；404（npm 上不存在）返回 null。 */
function fetchLatest(name) {
	const url = `${REGISTRY}/${name.replace('/', '%2F')}/latest`
	return new Promise((resolve, reject) => {
		const req = httpsRequest(url, {
			method: 'GET',
			headers: { 'user-agent': UA, accept: 'application/json' },
			timeout: UPDATES_TIMEOUT,
		}, (res) => {
			const chunks = []
			res.on('data', (chunk) => chunks.push(chunk))
			res.on('end', () => {
				if (res.statusCode === 404) {
					resolve(null)
					return
				}
				if (res.statusCode !== 200) {
					reject(new Error(`npm 查询失败（HTTP ${res.statusCode}）`))
					return
				}
				try {
					resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')).version ?? null)
				} catch (error) {
					reject(error)
				}
			})
		})
		req.on('error', reject)
		req.on('timeout', () => req.destroy(new Error('npm 查询超时')))
		req.end()
	})
}

let updatesCache = null // { at, frameworkInstalled, results }

/** 并发检查全部组件的 npm latest。官方框架组件跳过（随主程序整体升级）。 */
async function checkUpdates(ctx) {
	const frameworkInstalled = frameworkVersion(ctx.baseUrl)
	if (updatesCache !== null && Date.now() - updatesCache.at < UPDATES_TTL && updatesCache.frameworkInstalled === frameworkInstalled) {
		return updatesCache
	}
	const packages = listPackages(ctx)
	const checkable = packages.filter((p) => !p.name.startsWith(FRAMEWORK_SCOPE))
	const results = await Promise.all(checkable.map(async (p) => {
		const row = { name: p.name, installed: p.version, latest: null, updateAvailable: false, note: null }
		try {
			const latest = await fetchLatest(p.name)
			if (latest === null) {
				row.note = 'not-on-npm'
			} else {
				row.latest = latest
				row.updateAvailable = compareVersions(latest, p.version) > 0
			}
		} catch (error) {
			row.note = 'query-failed'
			row.error = error instanceof Error ? error.message : String(error)
		}
		return row
	}))
	let frameworkLatest = null
	try {
		frameworkLatest = await fetchLatest('@deepseek-ai/dsh')
	} catch {}
	const cacheRow = {
		at: Date.now(),
		frameworkInstalled,
		frameworkLatest,
		results,
	}
	updatesCache = cacheRow
	return cacheRow
}

// ---------------------------------------------------------------------------
// HTTP 路由
// ---------------------------------------------------------------------------

function isLoopback(address) {
	return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

/** 从加载器读取 webserver 监听端口（默认 3080）。 */
function webPort(ctx) {
	for (const entry of ctx.loader.entries()) {
		if (entry.options?.name === '@deepseek-ai/dsh-host-webserver') {
			const port = entry.options?.config?.port
			if (typeof port === 'number' && port > 0) return port
		}
	}
	return 3080
}

function sendJson(res, status, body) {
	res.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'no-store',
	})
	res.end(JSON.stringify(body))
}

function sendError(res, status, message) {
	sendJson(res, status, { ok: false, error: message })
}

async function handle(ctx, req, res) {
	const url = new URL(req.url ?? '/', 'http://x')
	const method = req.method ?? 'GET'

	if (method === 'GET' && url.pathname === `${ROUTE_PREFIX}/state`) {
		sendJson(res, 200, {
			ok: true,
			framework: { name: '@deepseek-ai/dsh', version: frameworkVersion(ctx.baseUrl) },
			packages: listPackages(ctx),
		})
		return
	}

	if (method === 'GET' && url.pathname === `${ROUTE_PREFIX}/updates`) {
		const data = await checkUpdates(ctx)
		sendJson(res, 200, {
			ok: true,
			checkedAt: data.at,
			framework: {
				name: '@deepseek-ai/dsh',
				installed: data.frameworkInstalled,
				latest: data.frameworkLatest,
				updateAvailable: data.frameworkLatest !== null
					&& data.frameworkInstalled !== null
					&& compareVersions(data.frameworkLatest, data.frameworkInstalled) > 0,
			},
			results: data.results,
		})
		return
	}

	sendError(res, 404, '未知路径')
}

/** 应用插件：注册 /dsh-versions 路由。 */
export function apply(ctx) {
	ctx.effect(() => {
		const route = {
			kind: 'prefix',
			path: ROUTE_PREFIX,
			handler: async (req, res) => {
				if (!isLoopback(req.socket?.remoteAddress ?? '')) {
					sendError(res, 403, '仅允许本机访问')
					return
				}
				const port = webPort(ctx)
				const host = typeof req.headers?.host === 'string' ? req.headers.host : ''
				if (![`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(host)) {
					sendError(res, 403, 'Host 校验失败（仅允许本机访问）')
					return
				}
				if ((req.method ?? 'GET') !== 'GET') {
					sendError(res, 405, '仅支持 GET')
					return
				}
				try {
					await handle(ctx, req, res)
				} catch (error) {
					sendError(res, 500, error instanceof Error ? error.message : String(error))
				}
			},
		}
		return ctx.webServer.register(route)
	}, 'dsh-versions: routes')
}
