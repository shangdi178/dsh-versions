/**
 * dsh-versions — dsh 主程序版本管理（宿主端）。
 *
 * 环回 HTTP 路由（前缀 /dsh-versions）：
 *   GET  /dsh-versions/state           dsh 主程序版本 + 平台/引擎支持状态
 *   GET  /dsh-versions/releases        dsh 全部已发布版本 + 渠道（dist-tags + 发布时间）
 *   GET  /dsh-versions/upgrade-status  当前升级任务状态（文件态，可断连恢复）
 *   GET  /dsh-versions/history         本地升级历史
 *   GET  /dsh-versions/snapshots       本地版本快照清单（秒级回滚用）
 *   POST /dsh-versions/upgrade         安装指定版本（升级/降级/重装，升级前自动快照 + 失败自动回滚）
 *   POST /dsh-versions/restore         从快照恢复指定版本（免 npm、免网络）
 *   POST /dsh-versions/relaunch        手动重启 dsh web 服务
 *
 * 升级引擎：生成 PowerShell 脚本经 schtasks 脱离服务进程树执行——
 * corepack pnpm 安装指定版本（npmjs → npmmirror 双源，仍失败停服重试一轮），
 * 以磁盘 package.json 版本为准校验，失败则 robocopy 恢复备份（备份无效绝不删目录），
 * 最后停服拉起新版本生效。升级前还会做版本键控的本地快照，支持任意历史版本秒级回滚。
 * 纯本地操作，仅允许本机访问。
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir, tmpdir } from 'node:os'
import { request as httpsRequest } from 'node:https'
import { execFile } from 'node:child_process'
import { compareVersions, parseVersion } from './compare.js'
import {
	createSnapshot,
	defaultSnapshotsDir,
	listSnapshots,
	removeSnapshot,
	restoreSnapshot,
} from './snapshot.js'
import { applyShim as applyShimById, listShims, removeShim as removeShimById, reconcileShims } from './shim.js'

/** Cordis 插件元信息。 */
export const name = 'dsh-versions'
export const inject = ['webServer', 'loader']

const ROUTE_PREFIX = '/dsh-versions'
const FRAMEWORK_PKG = '@deepseek-ai/dsh'
/** 升级/重启引擎依赖 Windows 工具（robocopy/schtasks/powershell 5.1），其他平台仅提供只读能力。 */
const ENGINE_PLATFORMS = ['win32']
const isEnginePlatform = (platform = process.platform) => ENGINE_PLATFORMS.includes(platform)
const ENGINE_PLATFORM_NOTE = '升级/重启引擎当前仅支持 Windows（依赖 robocopy / schtasks / Windows PowerShell 5.1）；版本查看与更新检查在所有平台可用。'
const REGISTRY = 'https://registry.npmjs.org'
const REGISTRY_MIRROR = 'https://registry.npmmirror.com'
const UA = 'dsh-versions/0.3 (local dsh web instance)'
const RELEASES_TTL = 10 * 60_000
const UPDATES_TIMEOUT = 8_000
const UPGRADE_DEADLINE_MIN = 15
const STATE_STALE_MS = 15 * 60_000

const OWN_PKG = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json')
const dshHome = () => process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
const dataDir = () => join(dshHome(), 'dsh-versions')
const stateFile = () => join(dataDir(), 'upgrade-state.txt')
const historyFile = () => join(dataDir(), 'history.jsonl')
const backupRoot = () => join(dataDir(), 'backups')
/** 快照根目录：随 DSH_HOME 走（便携部署时状态目录整体可迁移）。 */
const snapshotsDir = () => join(dataDir(), 'snapshots')
const SNAPSHOT_KEEP = 5

// ---------------------------------------------------------------------------
// 通用小件
// ---------------------------------------------------------------------------

/** 定位 dsh 主程序：优先宿主 baseUrl 解析，失败回退插件自身目录。 */
function resolveFramework(baseUrl) {
	for (const base of [baseUrl, OWN_PKG]) {
		if (!base) continue
		try {
			const require = createRequire(base)
			const pkgPath = require.resolve(`${FRAMEWORK_PKG}/package.json`)
			const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
			const dshDir = dirname(pkgPath)
			const binPath = join(dshDir, 'lib', 'bin.js')
			return { pkgPath, dshDir, binPath, version: typeof pkg.version === 'string' ? pkg.version : null }
		} catch {}
	}
	return null
}

function fetchJsonUrl(url, timeoutMs = UPDATES_TIMEOUT) {
	return new Promise((resolve, reject) => {
		const req = httpsRequest(url, {
			method: 'GET',
			headers: { 'user-agent': UA, accept: 'application/json' },
			timeout: timeoutMs,
		}, (res) => {
			const chunks = []
			res.on('data', (chunk) => chunks.push(chunk))
			res.on('end', () => {
				try {
					resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
				} catch {
					reject(new Error('registry 返回不是 JSON'))
				}
			})
		})
		req.on('error', reject)
		req.on('timeout', () => req.destroy(new Error('registry 查询超时')))
		req.end()
	})
}

// ---------------------------------------------------------------------------
// dsh 版本发布数据（渠道 + 全量版本）
// ---------------------------------------------------------------------------

let releasesCache = null
async function fetchReleases() {
	if (releasesCache !== null && Date.now() - releasesCache.at < RELEASES_TTL) return releasesCache
	let doc = null
	let lastError = null
	for (const base of [REGISTRY, REGISTRY_MIRROR]) {
		try {
			doc = await fetchJsonUrl(`${base}/${FRAMEWORK_PKG.replace('/', '%2F')}`, UPDATES_TIMEOUT)
			break
		} catch (error) {
			lastError = error
		}
	}
	if (doc === null) throw lastError ?? new Error('registry 不可达')
	const distTags = doc['dist-tags'] ?? {}
	const time = doc['time'] ?? {}
	const channels = ['latest', 'next', 'alpha']
	const releases = Object.keys(doc.versions ?? {})
		.filter((v) => typeof time[v] === 'string' && v !== 'created' && v !== 'modified')
		.map((v) => ({
			version: v,
			date: time[v],
			channels: channels.filter((c) => distTags[c] === v),
		}))
	releases.sort((a, b) => {
		const c = compareVersions(b.version, a.version)
		return c ?? String(b.date).localeCompare(String(a.date))
	})
	releasesCache = { at: Date.now(), distTags, releases }
	return releasesCache
}

// ---------------------------------------------------------------------------
// 升级引擎
// ---------------------------------------------------------------------------

/** PowerShell 字符串字面量（反斜杠是字面量，JSON.stringify 的 \\ 必须还原为 \）。 */
const ps = (s) => JSON.stringify(s).replace(/\\\\/gu, '\\')
/** PowerShell 单引号字符串字面量（内容中的单引号按 PS 规则加倍转义）。 */
const psq = (s) => "'" + String(s).replace(/'/gu, "''") + "'"

function readUpgradeState() {
	try {
		const raw = readFileSync(stateFile(), 'utf8').replace(/^\uFEFF/u, '')
		const idx = raw.indexOf('|')
		if (idx === -1) return null
		const status = raw.slice(0, idx)
		const message = raw.slice(idx + 1)
		const at = statSync(stateFile()).mtimeMs
		const terminal = status === 'done' || status === 'failed'
		const stale = !terminal && Date.now() - at > STATE_STALE_MS
		return { status, message, at, terminal, stale }
	} catch {
		return null
	}
}

function readHistory() {
	try {
		return readFileSync(historyFile(), 'utf8')
			.split(/\r?\n/u)
			.filter((line) => line.trim() !== '')
			.map((line) => {
				try { return JSON.parse(line) } catch { return null }
			})
			.filter(Boolean)
			.reverse()
	} catch {
		return []
	}
}

/** 是否有升级任务在跑（非终态且未超时）：垫片/快照变更与升级互斥。 */
function upgradeBusy() {
	const st = readUpgradeState()
	return st !== null && !st.terminal && !st.stale
}

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

async function readBody(req, maxBytes = 64 * 1024) {
	const chunks = []
	let total = 0
	for await (const chunk of req) {
		total += chunk.length
		if (total > maxBytes) throw new Error('请求体过大')
		chunks.push(chunk)
	}
	if (chunks.length === 0) return {}
	try {
		return JSON.parse(Buffer.concat(chunks).toString('utf8'))
	} catch {
		throw new Error('请求体不是合法 JSON')
	}
}

/**
 * 生成升级 PowerShell 脚本。流程（沿用 dsh-plugin-console 在本机全流程验证过的机制）：
 * corepack pnpm 安装指定版本（npmjs → npmmirror；仍失败停服后再各试一轮）
 * → 以磁盘 package.json 版本为准校验 → 失败 robocopy 恢复备份 → 停服拉起新版本生效。
 */
function buildUpgradeScript(p) {
	const L = [
		`$state = ${ps(p.stateFile)}`,
		`$log = ${ps(p.logFile)}`,
		`$hist = ${ps(p.historyFile)}`,
		"function Log($m) { try { Add-Content -Path $log -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $m) -Encoding UTF8 } catch {} }",
		"function SetState($s, $m) { try { Set-Content -Path $state -Value ($s + '|' + $m) -Encoding UTF8 } catch {} }",
		`function AddHistory($result) { try { Add-Content -Path $hist -Value ('{"at":' + [DateTimeOffset]::Now.ToUnixTimeMilliseconds() + ',"from":"' + '${p.from}' + '","to":"' + '${p.target}' + '","result":"' + $result + '"}') -Encoding UTF8 } catch {} }`,
		// 端口工具：Get-NetTCPConnection 看不到高完整性（管理员）监听者时，
		// 回退用 netstat 找 PID（netstat 对任何完整性级别都可见）；就绪探测用 HTTP 探活兜底。
		'function Get-ListenerPid($port) {',
		'  $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue',
		'  if ($c) { return ($c | Select-Object -First 1).OwningProcess }',
		'  try {',
		`    $needle = [regex]::Escape(':' + $port) + '\\s*$'`,
		'    foreach ($line in (netstat -ano -n)) {',
		'      $local = ($line -split \'\\s+\') | Where-Object { $_ -match $needle } | Select-Object -First 1',
		'      if ($local) {',
		'        $m = [regex]::Match($line, \'(\\d+)\\s*$\')',
		'        if ($m.Success) { return [int]$m.Groups[1].Value }',
		'      }',
		'    }',
		'  } catch {}',
		'  return $null',
		'}',
		'function Stop-Listener($port) {',
		'  $lp = Get-ListenerPid $port',
		'  if ($lp) {',
		'    try { Stop-Process -Id $lp -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2 } catch {}',
		'  }',
		'  return $lp',
		'}',
		'function Test-Port($port) {',
		"  try { $r = Invoke-WebRequest -Uri ('http://127.0.0.1:' + $port) -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { return $true } } catch {}",
		'  try { if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { return $true } } catch {}',
		'  return $false',
		'}',
		// 全局异常兜底：脚本任何未捕获异常都写 failed + 尝试拉起服务 + 自删任务
		'trap {',
		`  try { SetState 'failed' ('升级脚本异常终止：' + $_.Exception.Message); AddHistory 'failed' } catch {}`,
		`  try { Log ('升级脚本异常终止：' + $_.Exception.Message) } catch {}`,
		`  try { if (-not (Test-Port ${p.port})) { Start-Process -FilePath ${ps(p.nodePath)} -ArgumentList ${ps(p.binPath)},'web' -WorkingDirectory $env:USERPROFILE -WindowStyle Hidden -RedirectStandardOutput ${ps(p.logFile + '.out')} -RedirectStandardError ${ps(p.logFile + '.err')} } } catch {}`,
		`  schtasks /delete /f /tn ${p.taskName} 2>$null`,
		'  exit 1',
		'}',
		"SetState 'starting' '升级脚本启动'",
		`SetState 'installing' '安装 dsh ${p.from} -> ${p.target}（在线下载中，服务保持在线）'`,
		// schtasks 默认 cwd 是 system32——不切到全局 node_modules 会装错位置
		`Set-Location -Path ${ps(dirname(p.dshDir))}`,
		`function Install-Framework($reg) {`,
		`  $startAt = Get-Date`,
		`  $deadline = $startAt.AddMinutes(${UPGRADE_DEADLINE_MIN})`,
		`  $marker = ${ps(p.logFile + '.marker')}`,
		`  try { Remove-Item $marker -Force -ErrorAction SilentlyContinue } catch {}`,
		`  # 写批处理文件再由 cmd 执行：绕开 cmd /c 嵌套引号对带空格路径的拆解问题`,
		`  $cmdFile = ${ps(p.logFile + '.upgrade.cmd')}`,
		`  $cmdLines = @('@echo off', ('"${p.nodePath}" "${p.npmCliJs}" install -g ${FRAMEWORK_PKG}@${p.target} --force --registry ' + $reg), 'echo DSH-DONE:%ERRORLEVEL% > "${ps(p.logFile + '.marker').slice(1, -1)}"')`,
		`  try { Set-Content -Path $cmdFile -Value $cmdLines -Encoding ASCII } catch { Log ('写安装脚本失败：' + $_.Exception.Message); return 1 }`,
		`  try { Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', $cmdFile) -PassThru -WindowStyle Hidden | Out-Null } catch { Log ('启动安装失败：' + $_.Exception.Message); return 1 }`,
		`  $done = $false`,
		`  $code = 1`,
		`  while (-not $done -and (Get-Date) -lt $deadline) {`,
		`    Start-Sleep -Seconds 5`,
		`    if (Test-Path $marker) {`,
		`      $mc = Get-Content $marker -Raw -ErrorAction SilentlyContinue`,
		`      $mm = [regex]::Match($mc, 'DSH-DONE:(\\d+)')`,
		`      if ($mm.Success) { $code = [int]$mm.Groups[1].Value; $done = $true }`,
		`    }`,
		`    if (-not $done) { SetState 'installing' ('安装 dsh ${p.from} -> ${p.target}（已等待 ' + [int]((Get-Date) - $startAt).TotalSeconds + ' 秒）') }`,
		`  }`,
		`  if (-not $done) {`,
		`    Log 'npm 超过 ${UPGRADE_DEADLINE_MIN} 分钟未完成，判定超时'`,
		`    try { taskkill /F /FI "WINDOWTITLE eq DSH-Upgrade" 2>$null | Out-Null } catch {}`,
		`    return 1`,
		`  }`,
		`  # 退出码 0 不可信：以磁盘 package.json 版本 === 目标为准`,
		`  if ($code -eq 0) {`,
		`    try {`,
		`      $v = (Get-Content ${ps(join(p.dshDir, 'package.json'))} -Raw | ConvertFrom-Json).version`,
		`      if ($v -ne '${p.target}') { Log ('npm 退出码 0 但版本未更新（当前 ' + $v + '），按失败处理'); $code = 1 }`,
		`    } catch { Log 'npm 退出码 0 但无法读取新版本，按失败处理'; $code = 1 }`,
		`  }`,
		`  return $code`,
		`}`,
		// 回滚：robocopy 支持长路径；回滚前确保服务已停（进程 cwd 锁住框架目录）；
		// 备份缺失时绝不删除现有框架目录
		`function Invoke-Rollback {`,
		`  SetState 'rollback' '安装失败，回滚框架本体…'`,
		`  Log '安装失败，回滚框架本体…'`,
		`  if (-not (Test-Path ${ps(join(p.rollbackDir, 'lib', 'bin.js'))})) { Log ('回滚失败：备份缺失（' + ${ps(p.rollbackDir)} + '），跳过删除框架目录'); return }`,
		`  Stop-Listener ${p.port} | Out-Null`,
		`  Remove-Item ${ps(p.dshDir)} -Recurse -Force -ErrorAction SilentlyContinue`,
		`  robocopy ${ps(p.rollbackDir)} ${ps(p.dshDir)} /E /NFL /NDL /NJH /NJS /R:1 /W:1 | Out-Null`,
		`  if (Test-Path ${ps(join(p.dshDir, 'lib', 'bin.js'))}) { Log '回滚完成（框架目录已恢复）'; $script:rolledBack = $true } else { Log '回滚失败：复制失败，请手动修复框架安装' }`,
		`}`,
		'$script:rolledBack = $false',
		`$code = Install-Framework '${REGISTRY}'`,
		`if ($code -ne 0) { Log ('npmjs 安装失败（exit=' + $code + '），切换 npmmirror 重试一次'); $code = Install-Framework '${REGISTRY_MIRROR}' }`,
		`if ($code -ne 0) {`,
		`  SetState 'stopped' '在线安装失败（框架目录可能被服务占用），停止服务后重试…'`,
		`  Log '在线安装失败，停止服务后重试'`,
		`  Stop-Listener ${p.port} | Out-Null`,
		`  $code = Install-Framework '${REGISTRY}'`,
		`  if ($code -ne 0) { $code = Install-Framework '${REGISTRY_MIRROR}' }`,
		`}`,
		`if ($code -ne 0) { Invoke-Rollback } else { Log 'dsh 本体安装完成' }`,
		...(p.shimCliJs && p.dataDir ? [
		// 安装成功后、重启前：应用已启用的兼容性垫片（垫片必须在第一次重启前写入框架文件，否则跨次版本安装后的第一次启动会因插件树导入失败而崩溃）
		// 否则跨次版本安装后的第一次启动会因插件树导入失败而崩溃）
		`if ($code -eq 0) {`,
		`  SetState 'shim' '应用兼容性垫片（如已启用）…'`,
		`  if (Test-Path ${ps(p.shimCliJs)}) {`,
		`    try {`,
		`      $env:DSH_HOME = '${p.dshHome}'`,
		`      $out = & ${ps(p.nodePath)} ${ps(p.shimCliJs)} reconcile --fw '${p.target}' --dsh-dir ${ps(p.dshDir)} --data-dir ${ps(p.dataDir)} --backup-root ${ps(p.backupRoot)} --node ${ps(p.nodePath)} 2>&1`,
		`      foreach ($line in @($out)) { Log ('shim: ' + $line) }`,
		`    } catch { Log ('垫片应用失败（不影响升级本身）：' + $_.Exception.Message) }`,
		`  } else { Log '垫片 CLI 缺失，跳过垫片应用' }`,
		`}`,
		] : ['# dsh-versions: shim CLI 未配置，跳过兼容性垫片']),
		`SetState 'relaunching' '重启 DSH 服务生效…'`,
		`if (-not (Stop-Listener ${p.port})) { Log '旧服务未在监听（重启生效）' } else { Log '旧服务已停止（重启生效）' }`,
		// schtasks 任务环境不带 DSH_HOME，显式补上
		`$env:DSH_HOME = '${p.dshHome}'`,
		'$ok = $false',
		'$started = $false',
		`for ($i = 0; $i -lt 24; $i++) {`,
		`  try { if (Test-Port ${p.port}) { $ok = $true; break } } catch {}`,
		`  if (-not $ok -and -not $started) {`,
		`    try {`,
		`      Start-Process -FilePath ${ps(p.nodePath)} -ArgumentList ${ps(p.binPath)},'web' -WorkingDirectory $env:USERPROFILE -WindowStyle Hidden -RedirectStandardOutput ${ps(p.logFile + '.out')} -RedirectStandardError ${ps(p.logFile + '.err')}`,
		`      $started = $true; Log '已发起拉起服务'`,
		`    } catch { Log ('拉起异常：' + $_.Exception.Message) }`,
		`  }`,
		'  Start-Sleep -Seconds 5',
		`  if (-not $ok) { SetState 'relaunching' ('等待服务上线…（已等待 ' + ($i * 5 + 5) + ' 秒）') }`,
		'}',
		`if ($ok) {`,
		`  if ($script:rolledBack) { SetState 'failed' '安装失败，已回滚到 ${p.from}（服务已恢复）'; AddHistory 'rolled-back'; Log '安装失败已回滚，服务已恢复' }`,
		`  else { SetState 'done' '已切换到 dsh ${p.target}，服务已监听 ${p.port}'; AddHistory 'success'; Log '服务已监听 ${p.port}，升级完成' }`,
		`} else {`,
		`  SetState 'failed' '拉起失败：请手动运行 node ${p.binPath} web'; AddHistory 'failed'; Log '拉起失败：请手动运行 node ${p.binPath} web'`,
		`}`,
		`try { schtasks /delete /f /tn ${p.taskName} 2>$null } catch {}`,
	]
	return '\uFEFF' + L.filter((l) => l !== '').join('\r\n')
}

/** 生成仅重启服务的 PowerShell 脚本（手动拉起）。 */
function buildRelaunchScript(p) {
	const L = [
		`$log = ${ps(p.logFile)}`,
		"function Log($m) { try { Add-Content -Path $log -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $m) -Encoding UTF8 } catch {} }",
		'function Get-ListenerPid($port) {',
		'  $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue',
		'  if ($c) { return ($c | Select-Object -First 1).OwningProcess }',
		'  try {',
		`    $needle = [regex]::Escape(':' + $port) + '\\s*$'`,
		'    foreach ($line in (netstat -ano -n)) {',
		'      $local = ($line -split \'\\s+\') | Where-Object { $_ -match $needle } | Select-Object -First 1',
		'      if ($local) {',
		'        $m = [regex]::Match($line, \'(\\d+)\\s*$\')',
		'        if ($m.Success) { return [int]$m.Groups[1].Value }',
		'      }',
		'    }',
		'  } catch {}',
		'  return $null',
		'}',
		'function Stop-Listener($port) {',
		'  $lp = Get-ListenerPid $port',
		'  if ($lp) {',
		'    try { Stop-Process -Id $lp -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2 } catch {}',
		'  }',
		'  return $lp',
		'}',
		'function Test-Port($port) {',
		"  try { $r = Invoke-WebRequest -Uri ('http://127.0.0.1:' + $port) -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { return $true } } catch {}",
		'  try { if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { return $true } } catch {}',
		'  return $false',
		'}',
		'trap {',
		`  try { Log ('重启脚本异常终止：' + $_.Exception.Message) } catch {}`,
		`  schtasks /delete /f /tn ${p.taskName} 2>$null`,
		'  exit 1',
		'}',
		"Log '手动重启 DSH 服务…'",
		`$stopped = Stop-Listener ${p.port}`,
		`if ($stopped) { Log ('旧服务已停止（pid ' + $stopped + '）') } else { Log '未发现旧监听服务' }`,
		'$ok = $false',
		'$started = $false',
		`for ($i = 0; $i -lt 20; $i++) {`,
		`  try { if (Test-Port ${p.port}) { $ok = $true; break } } catch {}`,
		`  if (-not $ok -and -not $started) { Start-Process -FilePath ${ps(p.nodePath)} -ArgumentList ${ps(p.binPath)},'web' -WorkingDirectory $env:USERPROFILE -WindowStyle Hidden -RedirectStandardOutput ${ps(p.logFile + '.out')} -RedirectStandardError ${ps(p.logFile + '.err')}; $started = $true; Log '已发起拉起服务' }`,
		`      Log '已发起拉起服务'`,
		`    }`,
		`  }`,
		'  Start-Sleep -Seconds 5',
		'}',
		`if ($ok) { Log '服务已监听 ${p.port}' } else { Log '拉起失败：请手动运行 node ${p.binPath} web' }`,
		`try { schtasks /delete /f /tn ${p.taskName} 2>$null } catch {}`,
	]
	return '\uFEFF' + L.filter((l) => l !== '').join('\r\n')
}

/** schtasks 启动脚本（脱离服务进程树）；schtasks 不可用时退回 detached。 */
function launchDetachedScript(ps1, taskName) {
	return new Promise((resolve) => {
		const ps1Posix = ps1.replace(/\\/gu, '/')
		// 无引号 /tr：Task Scheduler 对带引号命令的解析会把 Command 拆坏（任务 Ready 但永不执行）
		const tr = / /.test(ps1Posix)
			? `"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \\"${ps1Posix}\\""`
			: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ' + ps1Posix
		execFile('schtasks.exe', ['/create', '/f', '/tn', taskName, '/tr', tr, '/sc', 'once', '/st', '00:00'], { windowsHide: true }, (error) => {
			const detachedFallback = () => {
				try { execFile('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', ps1], { windowsHide: true, detached: true, stdio: 'ignore' }, () => {}) } catch {}
				resolve()
			}
			if (error) {
				detachedFallback()
				return
			}
			// create 回调里立即 /run 会因任务注册未完成而静默失败：延迟 800ms 再 run
			setTimeout(() => {
				execFile('schtasks.exe', ['/run', '/tn', taskName], { windowsHide: true }, (runError) => {
					if (runError) detachedFallback()
					else resolve()
				})
			}, 800)
		})
	})
}

async function handleUpgrade(ctx, req, res) {
	if (!isEnginePlatform()) {
		sendError(res, 501, ENGINE_PLATFORM_NOTE)
		return
	}
	const body = await readBody(req)
	const target = typeof body?.target === 'string' ? body.target.trim() : ''
	if (parseVersion(target) === null) {
		sendError(res, 400, '目标版本号无效')
		return
	}
	const existing = readUpgradeState()
	if (existing !== null && !existing.terminal && !existing.stale) {
		sendError(res, 409, `已有升级任务在运行（${existing.status}），请等待其完成`)
		return
	}
	let doc = null
	try {
		doc = await fetchJsonUrl(`${REGISTRY}/${FRAMEWORK_PKG.replace('/', '%2F')}`, UPDATES_TIMEOUT)
	} catch (error) {
		sendError(res, 502, `无法读取 npm registry（${error instanceof Error ? error.message : String(error)}），已取消升级`)
		return
	}
	if (doc?.versions?.[target] === undefined) {
		sendError(res, 400, `目标版本 ${target} 在 npm 上不存在`)
		return
	}
	const fw = resolveFramework(ctx.baseUrl)
	if (fw === null || !existsSync(fw.dshDir) || !existsSync(fw.binPath)) {
		sendError(res, 500, '无法定位 dsh 安装目录（框架安装可能不完整），已取消升级')
		return
	}
	const nodePath = process.execPath
	// npm 的 lib/cli.js 是「函数模块」，直跑会假成功 exit 0；唯一正确入口是 bin/npm-cli.js
	const npmCliJs = join(dirname(nodePath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
	if (!existsSync(npmCliJs)) {
		sendError(res, 500, 'npm-cli.js 缺失，无法执行升级')
		return
	}
	const from = fw.version ?? 'unknown'
	// 兼容性提示：跨次版本（major.minor 不同）可能含破坏性变更——
	// 按旧次版本构建的第三方插件（Web UI 套件、市场等）可能无法加载（alpha/next 渠道尤其如此）
	let compatWarning = null
	const fromCore = parseVersion(from)?.core
	const targetCore = parseVersion(target)?.core
	if (fromCore && targetCore && (fromCore[0] !== targetCore[0] || fromCore[1] !== targetCore[1])) {
		compatWarning = `目标版本 ${target} 与当前 ${from} 不在同一个次版本系列（${fromCore[0]}.${fromCore[1]} → ${targetCore[0]}.${targetCore[1]}），可能包含破坏性变更：已安装的第三方插件可能暂时无法加载。`
	}
	// 备份回滚点：完整复制 dsh 包目录；无效（缺 lib/bin.js）直接取消
	const stamp = new Date().toISOString().replace(/[:.]/gu, '-')
	const backupDir = join(backupRoot(), `${from}-${stamp}`)
	const rollbackDir = join(backupDir, 'dsh-package-backup')
	try {
		mkdirSync(rollbackDir, { recursive: true })
		copyTree(fw.dshDir, rollbackDir)
	} catch (error) {
		sendError(res, 500, `框架备份失败（${error instanceof Error ? error.message : String(error)}），已取消升级`)
		return
	}
	if (!existsSync(join(rollbackDir, 'lib', 'bin.js'))) {
		sendError(res, 500, `回滚点无效（${rollbackDir} 缺少 lib/bin.js），已取消升级——请检查磁盘空间/权限`)
		return
	}
	// profile 配置快照（尽力而为）
	try {
		const profileDir = join(dshHome(), 'profiles', 'web')
		copyFileSync(join(profileDir, 'cordis.patch.yml'), join(backupDir, 'cordis.patch.yml'))
		copyFileSync(join(profileDir, 'package.json'), join(backupDir, 'profile-package.json'))
	} catch {}
	// 版本键控快照（尽力而为）：升级前把当前安装目录做成可按任意历史版本秒级回滚的本地快照。
	// 与上面的 robocopy 备份互为补充——快照按“版本”命名、免网络可随时恢复；失败只记日志，绝不阻塞升级。
	const snap = from === 'unknown' ? null : createSnapshot({ installDir: fw.dshDir, snapshotsDir: snapshotsDir(), version: from, keep: SNAPSHOT_KEEP })
	if (snap !== null && !snap.ok) {
		writeFileSync(stateFile(), 'starting|升级前快照失败（不影响升级）：' + String(snap.error), 'utf8')
	}
	// 生成并启动升级脚本
	mkdirSync(dataDir(), { recursive: true })
	const taskName = `DSH-VER-Upgrade-${process.pid}`
	const logFile = join(dataDir(), 'upgrade.log')
	const scriptPath = join(tmpdir(), `dsh-versions-upgrade-${process.pid}.ps1`)
	try { writeFileSync(stateFile(), 'starting|备份完成，升级脚本已启动…', 'utf8') } catch {}
	const script = buildUpgradeScript({
		stateFile: stateFile(),
		logFile,
		historyFile: historyFile(),
		dshDir: fw.dshDir,
		rollbackDir,
		nodePath,
		npmCliJs,
		shimCliJs: join(dirname(fileURLToPath(import.meta.url)), 'shim-cli.js'),
		dshHome: dshHome(),
		dataDir: dataDir(),
		backupRoot: backupRoot(),
		binPath: fw.binPath,
		port: webPort(ctx),
		target,
		from,
		taskName,
	})
	await launchDetachedScriptScript(script, scriptPath, taskName)
	sendJson(res, 200, { ok: true, started: true, from, target, backupDir, compatWarning })
}

/** 兼容旧命名：写入脚本文件后启动。 */
async function launchDetachedScriptScript(script, scriptPath, taskName) {
	writeFileSync(scriptPath, script, 'utf8')
	await launchDetachedScript(scriptPath, taskName)
}

/**
 * 从本地快照恢复指定版本。恢复是纯本地文件复制（免 npm、免网络），全平台可用；
 * 恢复成功后若在引擎平台则自动重启让新代码生效，否则提示手动重启。
 */
async function handleRestore(ctx, req, res) {
	const body = await readBody(req)
	const version = typeof body?.version === 'string' ? body.version.trim() : ''
	if (version === '') {
		sendError(res, 400, '缺少版本号')
		return
	}
	const fw = resolveFramework(ctx.baseUrl)
	if (fw === null || !existsSync(fw.dshDir)) {
		sendError(res, 500, '无法定位 dsh 安装目录，无法恢复')
		return
	}
	const active = readUpgradeState()
	if (active !== null && !active.terminal && !active.stale) {
		sendError(res, 409, '升级进行中，禁止恢复')
		return
	}
	const target = listSnapshots(snapshotsDir()).find((s) => s.version === version)
	if (target === undefined) {
		sendError(res, 404, `没有 ${version} 的快照`)
		return
	}
	if (!target.usable) {
		sendError(res, 400, `快照 ${version} 已损坏，无法恢复`)
		return
	}
	const result = restoreSnapshot({ installDir: fw.dshDir, snapshotsDir: snapshotsDir(), version })
	if (!result.ok) {
		sendError(res, 500, `恢复失败（${String(result.error)}）`)
		return
	}
	// 记入升级历史（result=restore）
	try {
		appendFileSync(historyFile(), `${JSON.stringify({ at: Date.now(), from: fw.version ?? 'unknown', to: version, result: 'restore' })}\n`, 'utf8')
	} catch {}
	if (isEnginePlatform()) {
		await handleRelaunch(ctx, res)
		return
	}
	sendJson(res, 200, { ok: true, restored: true, version, relaunched: false, message: '已从快照恢复，请手动重启 dsh 服务生效' })
}

async function handleRelaunch(ctx, res) {
	if (!isEnginePlatform()) {
		sendError(res, 501, ENGINE_PLATFORM_NOTE)
		return
	}
	const fw = resolveFramework(ctx.baseUrl)
	if (fw === null || !existsSync(fw.binPath)) {
		sendError(res, 500, '无法定位 dsh bin.js，无法重启')
		return
	}
	mkdirSync(dataDir(), { recursive: true })
	const taskName = `DSH-VER-Relaunch-${process.pid}`
	const logFile = join(dataDir(), 'relaunch.log')
	const scriptPath = join(tmpdir(), `dsh-versions-relaunch-${process.pid}.ps1`)
	const script = buildRelaunchScript({
		logFile,
		nodePath: process.execPath,
		binPath: fw.binPath,
		port: webPort(ctx),
		taskName,
	})
	await launchDetachedScriptScript(script, scriptPath, taskName)
	sendJson(res, 200, { ok: true, started: true })
}

// ---------------------------------------------------------------------------
// HTTP 基础件
// ---------------------------------------------------------------------------

function isLoopback(address) {
	return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

function webPort(ctx) {
	for (const entry of ctx.loader.entries()) {
		if (entry.options?.name === '@deepseek-ai/dsh-host-webserver') {
			const port = entry.options?.config?.port
			if (typeof port === 'number' && port > 0) return port
		}
	}
	return 3080
}

function allowedLocalOrigins(port) {
	return new Set([
		`http://127.0.0.1:${port}`,
		`http://localhost:${port}`,
		`http://[::1]:${port}`,
	])
}

/** 写请求跨站防护：校验 Origin / Sec-Fetch-Site（非浏览器客户端无这些头，放行）。 */
function isAllowedWriteOrigin(req, port) {
	const origin = typeof req.headers?.origin === 'string' ? req.headers.origin : null
	const site = typeof req.headers?.['sec-fetch-site'] === 'string' ? req.headers['sec-fetch-site'] : null
	if (origin !== null && origin !== '' && !allowedLocalOrigins(port).has(origin)) return false
	if (site !== null && site !== 'same-origin' && site !== 'none') return false
	return true
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
	const pathname = url.pathname
	const method = req.method ?? 'GET'

	if (method === 'GET' && pathname === `${ROUTE_PREFIX}/state`) {
		sendJson(res, 200, {
			ok: true,
			platform: process.platform,
			engineSupported: isEnginePlatform(),
			framework: { name: FRAMEWORK_PKG, version: resolveFramework(ctx.baseUrl)?.version ?? null },
		})
		return
	}

	if (method === 'GET' && pathname === `${ROUTE_PREFIX}/releases`) {
		try {
			const data = await fetchReleases()
			sendJson(res, 200, {
				ok: true,
				checkedAt: data.at,
				current: resolveFramework(ctx.baseUrl)?.version ?? null,
				distTags: data.distTags,
				releases: data.releases,
			})
		} catch (error) {
			sendError(res, 502, `无法读取 npm registry（${error instanceof Error ? error.message : String(error)}）`)
		}
		return
	}

	if (method === 'GET' && pathname === `${ROUTE_PREFIX}/upgrade-status`) {
		const st = readUpgradeState()
		// 终态（done/failed）只作为"最近一次操作"展示 30 分钟，之后回归 idle——
		// 否则昨天的升级横幅会一直挂在面板上，与当前实际版本自相矛盾
		const terminalExpired = st !== null && st.terminal && Date.now() - st.at > 30 * 60_000
		if (st === null || terminalExpired) sendJson(res, 200, { ok: true, status: 'idle' })
		else if (st.stale) sendJson(res, 200, { ok: true, status: 'failed', message: '升级状态残留超时（疑似中断），可重新发起', at: st.at })
		else sendJson(res, 200, { ok: true, status: st.status, message: st.message, at: st.at })
		return
	}

	if (method === 'GET' && pathname === `${ROUTE_PREFIX}/history`) {
		sendJson(res, 200, { ok: true, history: readHistory() })
		return
	}

	if (method === 'GET' && pathname === `${ROUTE_PREFIX}/snapshots`) {
		const snapshots = listSnapshots(snapshotsDir())
		const active = readUpgradeState()
		const busy = active !== null && !active.terminal && !active.stale
		sendJson(res, 200, { ok: true, snapshots, busy, keep: SNAPSHOT_KEEP })
		return
	}

	if (method === 'POST' && pathname === `${ROUTE_PREFIX}/restore`) {
		await handleRestore(ctx, req, res)
		return
	}

	if (method === 'GET' && pathname === `${ROUTE_PREFIX}/shims`) {
		const fw = resolveFramework(ctx.baseUrl)
		const busy = upgradeBusy()
		sendJson(res, 200, {
			ok: true,
			platform: process.platform,
			shims: listShims({
				fwVersion: fw?.version ?? null,
				dshDir: fw?.dshDir ?? null,
				nodePath: process.execPath,
				backupRoot: backupRoot(),
				dataDir: dataDir(),
			}),
			busy,
		})
		return
	}

	if (method === 'POST' && pathname === `${ROUTE_PREFIX}/shims/apply`) {
		if (upgradeBusy()) {
			sendError(res, 409, '升级进行中，暂不能变更垫片')
			return
		}
		const body = await readBody(req)
		const id = typeof body?.id === 'string' ? body.id : ''
		const fw = resolveFramework(ctx.baseUrl)
		const result = applyShimById(id, {
			fwVersion: fw?.version ?? null,
			dshDir: fw?.dshDir ?? null,
			nodePath: process.execPath,
			backupRoot: backupRoot(),
			dataDir: dataDir(),
		})
		if (result.ok === false) sendError(res, 500, result.error ?? '垫片应用失败')
		else sendJson(res, 200, { ok: true, ...result })
		return
	}

	if (method === 'POST' && pathname === `${ROUTE_PREFIX}/shims/remove`) {
		if (upgradeBusy()) {
			sendError(res, 409, '升级进行中，暂不能变更垫片')
			return
		}
		const body = await readBody(req)
		const id = typeof body?.id === 'string' ? body.id : ''
		const result = removeShimById(id, {
			fwVersion: resolveFramework(ctx.baseUrl)?.version ?? null,
			dshDir: resolveFramework(ctx.baseUrl)?.dshDir ?? null,
			nodePath: process.execPath,
			backupRoot: backupRoot(),
			dataDir: dataDir(),
		})
		if (result.ok === false) sendError(res, 500, result.error ?? '垫片移除失败')
		else sendJson(res, 200, { ok: true, ...result })
		return
	}

	if (method === 'POST' && pathname === `${ROUTE_PREFIX}/upgrade`) {
		await handleUpgrade(ctx, req, res)
		return
	}

	if (method === 'POST' && pathname === `${ROUTE_PREFIX}/relaunch`) {
		await handleRelaunch(ctx, res)
		return
	}

	sendError(res, 404, '未知路径')
}

// 供测试/调试使用的生成器（不随路由暴露）。
export const __builders = { buildUpgradeScript, buildRelaunchScript, isEnginePlatform, ENGINE_PLATFORM_NOTE }

/**
 * 插件此刻能加载，说明服务已在本进程上线：上次运行的 terminal 失败
 * （含「拉起失败：请手动运行…」提示）已成历史，重置为 idle 避免 UI 永远挂着旧错误。
 * 只在 terminal 失败时重置；done 保留展示，非终态由 stale 超时机制处理。
 */
function resetStaleFailureState() {
	try {
		const st = readUpgradeState()
		if (st !== null && st.terminal && st.status === 'failed') {
			writeFileSync(stateFile(), 'idle', 'utf8')
		}
	} catch {}
}

/** 应用插件：注册 /dsh-versions 路由。 */
export function apply(ctx) {
	ctx.effect(() => {
		resetStaleFailureState()
		// 启动时对已启用垫片做一致性整理：升级覆盖框架文件后自动恢复垫片；
		// 回滚到旧版本系列后自动卸载（防止与框架自带导出重复）。尽力而为，绝不阻塞启动。
		try {
			const fw = resolveFramework(ctx.baseUrl)
			const results = reconcileShims({
				fwVersion: fw?.version ?? null,
				dshDir: fw?.dshDir ?? null,
				nodePath: process.execPath,
				backupRoot: backupRoot(),
				dataDir: dataDir(),
			})
			for (const r of results) {
				try {
					appendFileSync(join(dataDir(), 'shims.log'), JSON.stringify({ at: Date.now(), ...r }) + '\n', 'utf8')
				} catch {}
			}
		} catch {}
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
				const method = req.method ?? 'GET'
				if (method === 'POST' && !isAllowedWriteOrigin(req, port)) {
					sendError(res, 403, '跨站请求被拒绝（Origin/Sec-Fetch-Site 校验）')
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
