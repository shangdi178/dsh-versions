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
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
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
import { checkCompat } from './compat.js'

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
const UA = 'dsh-versions/0.5 (local dsh web instance)'
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

/**
 * PowerShell 双引号字符串字面量。
 *
 * 不用 JSON.stringify：它按 JSON 规则转义，而 PowerShell 规则不同——
 * 反斜杠在 PS 里是普通字符；双引号串里 ` 是转义符、$ 触发变量展开，
 * 路径含这两个字符会静默改变语义（JSON 也不会处理它们）。
 */
const ps = (s) => '"' + String(s)
	.replace(/[`$"]/gu, (c) => (c === '"' ? '""' : '`' + c))
	.replace(/\r/gu, '`r')
	.replace(/\n/gu, '`n')
	.replace(/\t/gu, '`t')
	+ '"'
/** PowerShell 单引号字符串字面量（内容中的单引号按 PS 规则加倍转义）。 */
const psq = (s) => "'" + String(s).replace(/'/gu, "''") + "'"
/** Start-Process -ArgumentList 元素：路径含空格时参数值自带引号，PS 5.1 才不会拆断。 */
const psArg = (s) => `'"` + String(s).replace(/'/gu, "''") + `"'`

/**
 * 升级与重启脚本共用的端口/进程工具。
 *
 * 安全要点：Stop-Listener 只停止「确实是 dsh 的 node 进程」的监听者；
 * 端口被其他程序占用时返回 -1 拒绝停止，避免误杀。Test-DshUp 同样先校验
 * 进程身份再做 HTTP 探活，避免把别的服务的 200 当成 dsh 启动成功。
 */
function portToolLines() {
	return [
		'function Get-ListenerPid($port) {',
		'  $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue',
		'  if ($c) { return ($c | Select-Object -First 1).OwningProcess }',
		'  try {',
		`    $needle = [regex]::Escape(':' + $port) + '\\s*$'`,
		'    foreach ($line in (netstat -ano -n)) {',
		`      if ($line -notmatch '\\sLISTENING\\s') { continue }`,
		`      $parts = @(($line -split '\\s+') | Where-Object { $_ -ne '' })`,
		'      if ($parts.Length -lt 5) { continue }',
		'      if ($parts[1] -match $needle) { return [int]$parts[-1] }',
		'    }',
		'  } catch {}',
		'  return $null',
		'}',
		'function Test-DshProcess($procId) {',
		'  try {',
		`    $p = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $procId) -ErrorAction Stop`,
		'    if (-not $p) { return $false }',
		`    return ($p.Name -match '^node(\\.exe)?$' -and $p.CommandLine -match '@deepseek-ai[\\\\/]dsh' -and $p.CommandLine -match 'bin\\.js')`,
		'  } catch { return $false }',
		'}',
		'function Stop-Listener($port) {',
		'  $lp = Get-ListenerPid $port',
		'  if (-not $lp) { return $null }',
		'  if (-not (Test-DshProcess $lp)) { return -1 }',
		'  try { Stop-Process -Id $lp -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2 } catch {}',
		'  return $lp',
		'}',
		'function Test-Port($port) {',
		'  try {',
		"    $r = Invoke-WebRequest -Uri ('http://127.0.0.1:' + $port) -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop",
		'    if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { return $true }',
		'  } catch {',
		'    $resp = $_.Exception.Response',
		'    if ($resp -and [int]$resp.StatusCode -ge 200 -and [int]$resp.StatusCode -lt 500) { return $true }',
		'  }',
		'  return $false',
		'}',
		'function Test-DshUp($port) {',
		'  $lp = Get-ListenerPid $port',
		'  if (-not $lp) { return $false }',
		'  if (-not (Test-DshProcess $lp)) { return $false }',
		'  return (Test-Port $port)',
		'}',
	]
}

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
		...portToolLines(),
		// 全局异常兜底：脚本任何未捕获异常都写 failed + 尝试拉起服务 + 自删任务
		'trap {',
		`  try { SetState 'failed' ('升级脚本异常终止：' + $_.Exception.Message); AddHistory 'failed' } catch {}`,
		`  try { Log ('升级脚本异常终止：' + $_.Exception.Message) } catch {}`,
		`  try { if (-not (Test-DshUp ${p.port})) { Start-Process -FilePath ${ps(p.nodePath)} -ArgumentList @(${psArg(p.binPath)}, 'web') -WorkingDirectory $env:USERPROFILE -WindowStyle Hidden -RedirectStandardOutput ${ps(p.logFile + '.out')} -RedirectStandardError ${ps(p.logFile + '.err')} } } catch {}`,
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
		`  $outFile = ${ps(p.logFile + '.npm.out')}`,
		`  $errFile = ${ps(p.logFile + '.npm.err')}`,
		`  try { Remove-Item $outFile, $errFile -Force -ErrorAction SilentlyContinue } catch {}`,
		`  $script:failKind = 'install'`,
		`  $proc = $null`,
		`  $outTask = $null`,
		`  $errTask = $null`,
		`  try {`,
		`    $psi = New-Object System.Diagnostics.ProcessStartInfo`,
		`    $psi.FileName = ${ps(p.nodePath)}`,
		`    $psi.Arguments = ${ps(p.npmCliJs)} + ' install -g ${FRAMEWORK_PKG}@${p.target} --force --registry ' + $reg`,
		`    $psi.UseShellExecute = $false`,
		`    $psi.RedirectStandardOutput = $true`,
		`    $psi.RedirectStandardError = $true`,
		`    $psi.CreateNoWindow = $true`,
		`    $proc = New-Object System.Diagnostics.Process`,
		`    $proc.StartInfo = $psi`,
		`    $null = $proc.Start()`,
		`    $outTask = $proc.StandardOutput.ReadToEndAsync()`,
		`    $errTask = $proc.StandardError.ReadToEndAsync()`,
		`  } catch { Log ('启动安装进程失败：' + $_.Exception.Message); return 1 }`,
		`  if (-not $proc) { Log '启动安装进程失败：未取得进程句柄'; return 1 }`,
		`  $exited = $false`,
		`  while (-not $exited -and (Get-Date) -lt $deadline) {`,
		`    $exited = $proc.WaitForExit(5000)`,
		`    if (-not $exited) { $pct = [int](15 + [Math]::Min(45, ((Get-Date) - $startAt).TotalSeconds * 45 / (${UPGRADE_DEADLINE_MIN} * 60))); SetState 'installing' ('安装 dsh ${p.from} -> ${p.target}（已等待 ' + [int]((Get-Date) - $startAt).TotalSeconds + ' 秒）') $pct }`,
		`  }`,
		`  if (-not $exited) {`,
		`    Log 'npm 超过 ${UPGRADE_DEADLINE_MIN} 分钟未完成，强制结束安装进程树'`,
		`    try { taskkill /F /T /PID $proc.Id 2>$null | Out-Null } catch {}`,
		`    try { $proc.WaitForExit(5000) | Out-Null } catch {}`,
		`    try { $null = $errTask.Wait(2000) } catch {}`,
		`    try { Set-Content -Path $errFile -Value $errTask.Result -Encoding UTF8 } catch {}`,
		`    return 1`,
		`  }`,
		`  try { $proc.WaitForExit() } catch {}`,
		`  try { Set-Content -Path $outFile -Value $outTask.Result -Encoding UTF8 } catch {}`,
		`  try { Set-Content -Path $errFile -Value $errTask.Result -Encoding UTF8 } catch {}`,
		`  $code = $proc.ExitCode`,
		`  if ($code -ne 0) {`,
		`    $tail = ''`,
		`    try { $tail = (Get-Content $errFile -Tail 80 -ErrorAction SilentlyContinue) -join ' ' } catch {}`,
		`    if ($tail -match 'EAI_AGAIN|ENOTFOUND|ETIMEDOUT|ECONNREFUSED|ECONNRESET|ERR_SOCKET|network') { $script:failKind = 'download' }`,
		`    Log ('npm 退出码 ' + $code + '（' + $script:failKind + '）')`,
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
		`  SetState 'rollback' '安装失败，正在恢复原版本…'`,
		`  Log '安装失败，正在恢复原版本…'`,
		`  if (-not (Test-Path ${ps(join(p.rollbackDir, 'lib', 'bin.js'))})) { Log ('回滚失败：备份缺失（' + ${ps(p.rollbackDir)} + '），原安装未改动'); $script:rollbackFailed = $true; return }`,
		`  $parent = ${ps(dirname(p.dshDir))}`,
		`  $leaf = ${psq(basename(p.dshDir))}`,
		`  $stage = Join-Path $parent ($leaf + '.rollback-stage-' + $PID)`,
		`  $aside = $leaf + '.failed-' + $PID`,
		`  try { Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue } catch {}`,
		`  robocopy ${ps(p.rollbackDir)} $stage /E /NFL /NDL /NJH /NJS /R:1 /W:1 | Out-Null`,
		`  if (-not (Test-Path (Join-Path (Join-Path $stage 'lib') 'bin.js'))) { Log '回滚失败：暂存副本不完整（原安装未改动）'; try { Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue } catch {}; $script:rollbackFailed = $true; return }`,
		`  $stop = Stop-Listener ${p.port}`,
		`  if ($stop -eq -1) { Log '端口被其他程序占用，跳过停止（不误杀）' }`,
		`  try { Rename-Item -LiteralPath ${ps(p.dshDir)} -NewName $aside -ErrorAction Stop } catch { Log ('回滚失败：安装目录无法改名（' + $_.Exception.Message + '），原安装未改动'); try { Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue } catch {}; $script:rollbackFailed = $true; return }`,
		`  try { Rename-Item -LiteralPath $stage -NewName $leaf -ErrorAction Stop } catch { try { Rename-Item -LiteralPath (Join-Path $parent $aside) -NewName $leaf -ErrorAction SilentlyContinue } catch {}; try { Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue } catch {}; Log '回滚失败：无法换入旧版本（已尝试还原原安装）'; $script:rollbackFailed = $true; return }`,
		`  if (Test-Path ${ps(join(p.dshDir, 'lib', 'bin.js'))}) { try { Remove-Item (Join-Path $parent $aside) -Recurse -Force -ErrorAction SilentlyContinue } catch {}; Log '回滚完成（框架目录已恢复）'; $script:rolledBack = $true } else { Log ('回滚失败：恢复后缺少 lib/bin.js（原安装保留在 ' + $aside + '）'); $script:rollbackFailed = $true }`,
		`}`,
		`$script:rolledBack = $false`,
		`$script:rollbackFailed = $false`,
		`$script:rollbackReason = 'install'`,
		`$script:failKind = 'install'`,
		`$code = Install-Framework '${REGISTRY}'`,
		`if ($code -ne 0) { Log ('npmjs 安装失败（exit=' + $code + '），切换 npmmirror 重试一次'); $code = Install-Framework '${REGISTRY_MIRROR}' }`,
		`if ($code -ne 0) {`,
		`  SetState 'stopped' '在线安装失败（框架目录可能被服务占用），停止服务后重试…'`,
		`  Log '在线安装失败，停止服务后重试'`,
		`  $stop = Stop-Listener ${p.port}`,
		`  if ($stop -eq -1) { Log '端口被其他程序占用，跳过停止（不误杀）' }`,
		`  $code = Install-Framework '${REGISTRY}'`,
		`  if ($code -ne 0) { $code = Install-Framework '${REGISTRY_MIRROR}' }`,
		`}`,
		`if ($code -ne 0) { Invoke-Rollback } else { Log 'dsh 本体安装完成' }`,
		`if ($code -ne 0 -and -not $script:rolledBack) {`,
		`  $reason = '安装失败'`,
		`  if ($script:failKind -eq 'download') { $reason = '下载失败' }`,
		`  SetState 'failed' ('[恢复失败] ' + $reason + '后未能恢复原版本：请手动运行 node ${ps(p.binPath)} web；备份位于 ${ps(p.rollbackDir)}') 100`,
		`  AddHistory 'failed'`,
		`  Log ('[恢复失败] ' + $reason + '后未能恢复原版本')`,
		`  try { schtasks /delete /f /tn ${p.taskName} 2>$null } catch {}`,
		`  exit 1`,
		`}`,
		...(p.shimCliJs && p.dataDir ? [
		// 安装成功后、重启前：应用已启用的兼容性垫片（必须在第一次重启前写入，否则跨次版本首次启动可能崩溃）
		`if ($code -eq 0) {`,
		`  SetState 'shim' '应用兼容性垫片（如已启用）…'`,
		`  if (Test-Path ${ps(p.shimCliJs)}) {`,
		`    try {`,
		`      $env:DSH_HOME = ${ps(p.dshHome)}`,
		`      $out = & ${ps(p.nodePath)} ${ps(p.shimCliJs)} reconcile --fw '${p.target}' --dsh-dir ${ps(p.dshDir)} --data-dir ${ps(p.dataDir)} --backup-root ${ps(p.backupRoot)} --node ${ps(p.nodePath)} 2>&1`,
		`      foreach ($line in @($out)) { Log ('shim: ' + $line) }`,
		`    } catch { Log ('垫片应用失败（不影响升级本身）：' + $_.Exception.Message) }`,
		`  } else { Log '垫片 CLI 缺失，跳过垫片应用' }`,
		`}`,
		] : ['# dsh-versions: shim CLI 未配置，跳过兼容性垫片']),
		`SetState 'relaunching' '重启 DSH 服务生效…'`,
		`$stop = Stop-Listener ${p.port}`,
		`if ($stop -eq -1) { Log '端口被其他程序占用，无法停止并重启 DSH（请检查端口冲突）' } elseif ($stop) { Log '旧服务已停止（重启生效）' } else { Log '旧服务未在监听（重启生效）' }`,
		// schtasks 任务环境不带 DSH_HOME，显式补上
		`$env:DSH_HOME = ${ps(p.dshHome)}`,
		`$ok = $false`,
		`$started = $false`,
		`for ($i = 0; $i -lt 24; $i++) {`,
		`  try { if (Test-DshUp ${p.port}) { $ok = $true; break } } catch {}`,
		`  if (-not $ok -and -not $started) {`,
		`    try {`,
		`      Start-Process -FilePath ${ps(p.nodePath)} -ArgumentList @(${psArg(p.binPath)}, 'web') -WorkingDirectory $env:USERPROFILE -WindowStyle Hidden -RedirectStandardOutput ${ps(p.logFile + '.out')} -RedirectStandardError ${ps(p.logFile + '.err')}`,
		`      $started = $true; Log '已发起拉起服务'`,
		`    } catch { Log ('拉起异常：' + $_.Exception.Message) }`,
		`  }`,
		`  Start-Sleep -Seconds 5`,
		`  if (-not $ok) { $wpct = [int](85 + [Math]::Min(12, ($i * 5 + 5) * 12 / 100)); SetState 'relaunching' ('等待服务上线…（已等待 ' + ($i * 5 + 5) + ' 秒）') $wpct }`,
		`}`,
		`if (-not $ok) {`,
		`  $script:rollbackReason = 'start'`,
		`  SetState 'rollback' '[启动失败] 新版本未能上线，正在回滚…' 90`,
		`  Log '[启动失败] 新版本未能上线，正在回滚…'`,
		`  if (-not $script:rolledBack) { Invoke-Rollback }`,
		`  if ($script:rolledBack) {`,
		`    $started = $false`,
		`    for ($j = 0; $j -lt 12; $j++) {`,
		`      try { if (Test-DshUp ${p.port}) { $ok = $true; break } } catch {}`,
		`      if (-not $started) { try { Start-Process -FilePath ${ps(p.nodePath)} -ArgumentList @(${psArg(p.binPath)}, 'web') -WorkingDirectory $env:USERPROFILE -WindowStyle Hidden -RedirectStandardOutput ${ps(p.logFile + '.out')} -RedirectStandardError ${ps(p.logFile + '.err')}; $started = $true; Log '已拉起回滚后的旧版本' } catch { Log ('拉起旧版本异常：' + $_.Exception.Message) } }`,
		`      Start-Sleep -Seconds 5`,
		`    }`,
		`  }`,
		`}`,
		`if ($ok) {`,
		`  if ($script:rolledBack) {`,
		`    $label = '[安装失败]'`,
		`    if ($script:rollbackReason -eq 'start') { $label = '[启动失败]' }`,
		`    SetState 'failed' ($label + ' 已自动回滚到 ${p.from}（服务已恢复）') 100`,
		`    AddHistory 'rolled-back'`,
		`    Log ($label + ' 已自动回滚，服务已恢复')`,
		`  } else {`,
		`    SetState 'done' '已切换到 dsh ${p.target}，服务已监听 ${p.port}' 100`,
		`    AddHistory 'success'`,
		`    Log '服务已监听 ${p.port}，升级完成'`,
		`  }`,
		`} else {`,
		`  $label = '[安装失败]'`,
		`  if ($script:rollbackFailed -or $script:rolledBack) { $label = '[恢复失败]' }`,
		`  elseif ($script:failKind -eq 'download') { $label = '[下载失败]' }`,
		`  SetState 'failed' ($label + ' 自动恢复未成功：请手动运行 node ${ps(p.binPath)} web；备份位于 ${ps(p.rollbackDir)}') 100`,
		`  AddHistory 'failed'`,
		`  Log ($label + ' 自动恢复未成功')`,
		`}`,
		`try { schtasks /delete /f /tn ${p.taskName} 2>$null } catch {}`,
	]
	return '\uFEFF' + L.filter((l) => l !== '').join('\r\n')
}

/** 生成仅重启服务的 PowerShell 脚本（手动拉起）。 */
function buildRelaunchScript(p) {
	const L = [
		`$state = ${ps(p.stateFile)}`,
		`$log = ${ps(p.logFile)}`,
		"function Log($m) { try { Add-Content -Path $log -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $m) -Encoding UTF8 } catch {} }",
		"function SetState($s, $m) { try { Set-Content -Path $state -Value ($s + '|' + $m) -Encoding UTF8 } catch {} }",
		...portToolLines(),
		'trap {',
		`  try { SetState 'failed' ('重启脚本异常终止：' + $_.Exception.Message) } catch {}`,
		`  try { Log ('重启脚本异常终止：' + $_.Exception.Message) } catch {}`,
		`  schtasks /delete /f /tn ${p.taskName} 2>$null`,
		'  exit 1',
		'}',
		`SetState 'relaunching' '手动重启 DSH 服务…'`,
		`$stopped = Stop-Listener ${p.port}`,
		`if ($stopped -eq -1) { Log '端口被其他程序占用，拒绝停止（不误杀）' } elseif ($stopped) { Log ('旧服务已停止（pid ' + $stopped + '）') } else { Log '未发现旧监听服务' }`,
		`SetState 'relaunching' '旧服务已处理，正在拉起新服务…'`,
		'$ok = $false',
		'$started = $false',
		`for ($i = 0; $i -lt 20; $i++) {`,
		`  try { if (Test-DshUp ${p.port}) { $ok = $true; break } } catch {}`,
		`  if (-not $ok -and -not $started) {`,
		`    try {`,
		`      Start-Process -FilePath ${ps(p.nodePath)} -ArgumentList @(${psArg(p.binPath)}, 'web') -WorkingDirectory $env:USERPROFILE -WindowStyle Hidden -RedirectStandardOutput ${ps(p.logFile + '.out')} -RedirectStandardError ${ps(p.logFile + '.err')}`,
		`      $started = $true; Log '已发起拉起服务'`,
		`    } catch { Log ('拉起异常：' + $_.Exception.Message) }`,
		`  }`,
		'  Start-Sleep -Seconds 5',
		`  if (-not $ok) { SetState 'relaunching' ('等待服务上线…（已等待 ' + ($i * 5 + 5) + ' 秒）') }`,
		`}`,
		`if ($ok) { SetState 'done' '服务已重启，已监听 ${p.port}' 100; Log '服务已监听 ${p.port}' } else { SetState 'failed' '拉起失败：请手动运行 node ${p.binPath} web' 100; Log '拉起失败：请手动运行 node ${p.binPath} web' }`,
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

/**
 * 脚本落盘位置：插件数据目录（持久区），不再写系统 TEMP。
 * Windows 上 TEMP 可能被清理/安全软件扫描，脚本创建后随即消失 → 任务 exit 1 且无日志。
 */
function scriptPathFor(kind) {
	const dir = join(dataDir(), 'tmp')
	mkdirSync(dir, { recursive: true })
	return join(dir, `dsh-versions-${kind}-${process.pid}.ps1`)
}

async function handleUpgrade(ctx, req, res) {
	if (!isEnginePlatform()) {
		sendError(res, 501, ENGINE_PLATFORM_NOTE)
		return
	}
	const port = webPort(ctx, req)
	if (port === null) {
		sendError(res, 500, '无法解析 dsh web 实际监听端口，已取消升级（避免停止/探活错误端口）')
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
	let precheckError = null
	// 与安装引擎同一套双源策略：npmjs 不可达/缺少目标版本时，继续问镜像
	for (const base of [REGISTRY, REGISTRY_MIRROR]) {
		try {
			const candidate = await fetchJsonUrl(`${base}/${FRAMEWORK_PKG.replace('/', '%2F')}`, UPDATES_TIMEOUT)
			doc = candidate
			if (candidate?.versions?.[target] !== undefined) break
		} catch (error) {
			precheckError = error
		}
	}
	if (doc === null) {
		sendError(res, 502, `[下载失败] 无法读取 npm registry（${precheckError instanceof Error ? precheckError.message : String(precheckError)}），已取消升级`)
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
	const scriptPath = scriptPathFor('upgrade')
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
		port,
		target,
		from,
		taskName,
	})
	try {
		await launchDetachedScriptScript(script, scriptPath, taskName)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		try { writeFileSync(stateFile(), `failed|[启动失败] 无法启动升级脚本：${message}`, 'utf8') } catch {}
		sendError(res, 500, `[启动失败] 无法启动升级脚本（${message}）`)
		return
	}
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
		sendError(res, 500, `[恢复失败] ${String(result.error)}`)
		return
	}
	// 记入升级历史（result=restore）
	try {
		appendFileSync(historyFile(), `${JSON.stringify({ at: Date.now(), from: fw.version ?? 'unknown', to: version, result: 'restore' })}\n`, 'utf8')
	} catch {}
	if (isEnginePlatform()) {
		await handleRelaunch(ctx, req, res)
		return
	}
	sendJson(res, 200, { ok: true, restored: true, version, relaunched: false, message: '已从快照恢复，请手动重启 dsh 服务生效' })
}

async function handleRelaunch(ctx, req, res) {
	if (!isEnginePlatform()) {
		sendError(res, 501, ENGINE_PLATFORM_NOTE)
		return
	}
	const port = webPort(ctx, req)
	if (port === null) {
		sendError(res, 500, '无法解析 dsh web 实际监听端口，已取消重启（避免停止/探活错误端口）')
		return
	}
	if (upgradeBusy()) {
		sendError(res, 409, '升级进行中，禁止重启（避免中断安装/回滚）')
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
	const scriptPath = scriptPathFor('relaunch')
	try { writeFileSync(stateFile(), 'relaunching|手动重启 DSH 服务…', 'utf8') } catch {}
	const script = buildRelaunchScript({
		stateFile: stateFile(),
		logFile,
		nodePath: process.execPath,
		binPath: fw.binPath,
		port,
		taskName,
	})
	try {
		await launchDetachedScriptScript(script, scriptPath, taskName)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		try { writeFileSync(stateFile(), `failed|[启动失败] 无法启动重启脚本：${message}`, 'utf8') } catch {}
		sendError(res, 500, `[启动失败] 无法启动重启脚本（${message}）`)
		return
	}
	sendJson(res, 200, { ok: true, started: true })
}

// ---------------------------------------------------------------------------
// HTTP 基础件
// ---------------------------------------------------------------------------

function isLoopback(address) {
	return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

/**
 * 解析 dsh web 实际监听端口。
 *
 * 首选 req.socket.localPort：那是 Node http server 实际监听的端口，天然正确。
 * 退而求其次读 loader 配置；`!!js` 表达式求值后可能是函数，需要执行取数字。
 * 绝不能用硬编码端口去停止/探活——那会停错程序并把别人的 200 当成启动成功。
 */
function webPort(ctx, req) {
	const actual = req?.socket?.localPort
	if (typeof actual === 'number' && actual > 0) return actual
	// 退化路径：从 Host 头取端口；仍拿不到就返回 null，绝不猜 3080 去停别人的进程
	const host = req?.headers?.host
	if (typeof host === 'string') {
		const match = /:(\d+)$/u.exec(host)
		if (match !== null) {
			const port = Number(match[1])
			if (port > 0) return port
		}
	}
	for (const entry of ctx.loader.entries()) {
		if (entry.options?.name !== '@deepseek-ai/dsh-host-webserver') continue
		let port = entry.options?.config?.port
		if (typeof port === 'function') {
			try {
				port = port()
			} catch {
				port = null
			}
		}
		if (typeof port === 'number' && port > 0) return port
	}
	return null
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

/** 收集当前 profile 已安装的第三方插件（名称+版本），供兼容性检查扫描。 */
function collectPackages(ctx) {
	const seen = new Set()
	const packages = []
	for (const entry of ctx.loader.entries()) {
		if (entry.options?.group) continue
		const name = entry.options?.name
		if (typeof name !== 'string' || name === '' || name.startsWith('cordis:') || name.startsWith('@deepseek-ai/') || seen.has(name)) continue
		seen.add(name)
		let version = null
		try {
			const require = createRequire(ctx.baseUrl ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'))
			version = JSON.parse(readFileSync(require.resolve(`${name}/package.json`), 'utf8')).version ?? null
		} catch {}
		if (version === null) continue
		packages.push({ name, version })
	}
	packages.sort((a, b) => a.name.localeCompare(b.name))
	return packages
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

	if (method === 'GET' && pathname === `${ROUTE_PREFIX}/compat`) {
		const target = url.searchParams.get('target') ?? ''
		if (parseVersion(target) === null) {
			sendError(res, 400, 'target 版本号无效')
			return
		}
		try {
			const result = await checkCompat(collectPackages(ctx), target, ctx.baseUrl)
			sendJson(res, 200, { ok: true, ...result })
		} catch (error) {
			sendError(res, 502, `兼容性检查失败：${error instanceof Error ? error.message : String(error)}`)
		}
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
export const __builders = { buildUpgradeScript, buildRelaunchScript, scriptPathFor, webPort, isEnginePlatform, ENGINE_PLATFORM_NOTE }

/**
 * 插件此刻能加载，说明服务已在本进程上线：上次运行的 terminal 失败
 * （含「拉起失败：请手动运行…」提示）已成历史，重置为 idle 避免 UI 永远挂着旧错误。
 * 只在 terminal 失败时重置；done 保留展示，非终态由 stale 超时机制处理。
 */
function resetStaleFailureState() {
	try {
		const st = readUpgradeState()
		// 带 [分类] 前缀的失败是升级脚本在本轮结束前写入的（含“已自动回滚”），
		// 新进程启动时不能当成历史残留清掉，否则用户永远看不到失败原因。
		if (st !== null && st.terminal && st.status === 'failed' && !/^\[/u.test(st.message)) {
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
				const port = webPort(ctx, req)
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
