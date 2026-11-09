import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { __builders } from '../lib/index.js'

const { buildUpgradeScript, buildRelaunchScript, scriptPathFor, webPort } = __builders

const p = {
	stateFile: 'C:\\Users\\t\\.dsh\\dsh-versions\\upgrade-state.txt',
	logFile: 'C:\\Users\\t\\.dsh\\dsh-versions\\upgrade.log',
	historyFile: 'C:\\Users\\t\\.dsh\\dsh-versions\\history.jsonl',
	dshDir: 'C:\\Users\\t\\AppData\\Roaming\\npm\\node_modules\\@deepseek-ai\\dsh',
	rollbackDir: 'C:\\Users\\t\\.dsh\\dsh-versions\\backups\\0.1.1-rc.2-2026-01-01\\dsh-package-backup',
	nodePath: 'C:\\Program Files\\nodejs\\node.exe',
	npmCliJs: 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js',
	dshHome: 'C:\\Users\\t\\.dsh',
	binPath: 'C:\\Users\\t\\AppData\\Roaming\\npm\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js',
	port: 3080,
	target: '0.1.2-alpha.3',
	from: '0.1.1-rc.2',
	taskName: 'DSH-VER-Upgrade-123',
}

test('升级脚本：npm 安装走 .NET Process（可靠取退出码），registry/版本不再拆行（回归：误判失败/9009）', () => {
	const s = buildUpgradeScript(p)
	assert.ok(s.includes('System.Diagnostics.ProcessStartInfo'), 'npm 安装应使用 .NET Process（PS 5.1 的 Start-Process 重定向不填 ExitCode）')
	assert.ok(s.includes('$psi.RedirectStandardError = $true'), '应重定向 stderr 以便区分下载/安装失败')
	assert.ok(s.includes('ReadToEndAsync'), '应异步读输出，避免管道写满死锁')
	assert.ok(
		s.includes("' install -g @deepseek-ai/dsh@0.1.2-alpha.3 --force --registry ' + $reg"),
		'目标版本与 registry 应拼在同一个参数串中，不能拆行',
	)
	assert.ok(s.includes('$code = $proc.ExitCode'), '必须读取真实退出码')
	assert.ok(s.includes('taskkill /F /T /PID $proc.Id'), '超时应按 PID 结束进程树')
	assert.ok(!s.includes('cmdLines'), '不应再回退到 cmd 批处理（引号/ANSI 编码/残留进程问题）')
	assert.ok(s.includes('Get-Content '), '应读取磁盘 package.json 校验版本')
	assert.ok(s.includes('robocopy '), '应含回滚用的 robocopy')
	assert.ok(s.includes('schtasks /delete /f /tn DSH-VER-Upgrade-123'), '脚本末尾应自删任务')
	for (const tag of ['[下载失败]', '[安装失败]', '[启动失败]', '[恢复失败]']) {
		assert.ok(s.includes(tag), `失败状态应包含可区分的 ${tag} 标签`)
	}
})

test('端口工具：netstat 只认 LISTENING 行 + 校验 dsh 进程身份（回归：误杀同端口其他程序）', () => {
	const s = buildUpgradeScript(p)
	assert.ok(s.includes('function Get-ListenerPid($port) {'), '应保留 netstat 回退的监听 PID 查找')
	assert.ok(s.includes("$line -notmatch '\\sLISTENING\\s'"), 'netstat 回退只认 LISTENING 行，不能误取远端端口')
	assert.ok(s.includes('function Test-DshProcess($procId) {'), '停止监听者前应校验进程身份')
	assert.ok(s.includes('Get-CimInstance Win32_Process'), '应读取进程命令行确认是 dsh')
	assert.ok(s.includes('function Stop-Listener($port) {'), '应定义 Stop-Listener')
	assert.ok(s.includes('function Test-DshUp($port) {'), '就绪探测应校验 dsh 身份')
	assert.ok(s.includes('Invoke-WebRequest'), 'Test-Port 应使用 HTTP 探活')
	assert.ok(s.includes('$_.Exception.Response'), '401/403 鉴权响应也应视为服务已在线（不能误判未启动）')
	assert.ok(s.includes('-WorkingDirectory $env:USERPROFILE'), '拉起服务应带工作目录（避免 system32 cwd）')
	assert.ok(s.includes('-RedirectStandardOutput '), '拉起服务应重定向 stdout 便于诊断')
	assert.ok(s.includes('-RedirectStandardError '), '拉起服务应重定向 stderr 便于诊断')
})

test('重启脚本：无重复语句/多余大括号，使用同一份端口工具与带引号参数', () => {
	const s = buildRelaunchScript(p)
	assert.equal((s.match(/Log '已发起拉起服务'/g) ?? []).length, 1, '拉起日志只应出现一次（回归：重复语句）')
	assert.ok(s.includes('function Test-DshUp($port) {'), '重启脚本应定义 Test-DshUp')
	assert.ok(s.includes("-ArgumentList @('\""), 'Start-Process 参数数组应使用自引号路径')
	assert.ok(s.includes('-WorkingDirectory $env:USERPROFILE'), '重启脚本拉起服务应带工作目录')
	assert.ok(s.includes('schtasks /delete /f /tn DSH-VER-Upgrade-123'), '重启脚本末尾应自删任务')
})

test('路径转义：$、反引号、空格不会破坏 PowerShell 字符串/参数（回归：路径静默改写）', () => {
	const q = {
		...p,
		dshHome: 'C:\\Users\\a$b`c',
		logFile: 'C:\\Users\\a$b`c\\x.log',
		binPath: 'C:\\Program Files\\dsh \\lib\\bin.js',
	}
	const s = buildRelaunchScript(q)
	assert.ok(s.includes('a`$b``c'), '$ 与反引号应按 PowerShell 规则转义（反引号加倍）')
	assert.ok(s.includes(`'"${q.binPath}"'`), '带空格路径应作为自引号参数传给 Start-Process')
})

test('脚本目录：落在 DSH_HOME 的插件数据目录，不依赖系统 TEMP（回归：TEMP 被清理）', () => {
	const previous = process.env.DSH_HOME
	const home = mkdtempSync(join(tmpdir(), 'dshv-home-'))
	process.env.DSH_HOME = home
	try {
		const file = scriptPathFor('upgrade')
		assert.equal(dirname(file), join(home, 'dsh-versions', 'tmp'))
		assert.ok(existsSync(dirname(file)), '脚本目录应已创建')
		assert.ok(file.endsWith('.ps1'))
	} finally {
		if (previous === undefined) delete process.env.DSH_HOME
		else process.env.DSH_HOME = previous
		rmSync(home, { recursive: true, force: true })
	}
})

test('端口解析：优先实际监听端口，解析失败返回 null 而不是猜 3080（回归：误杀同端口程序）', () => {
	const empty = { loader: { entries: () => [] } }
	assert.equal(webPort(empty, { socket: { localPort: 4321 } }), 4321)
	assert.equal(webPort(empty, { headers: { host: '127.0.0.1:5555' } }), 5555)
	assert.equal(webPort(empty, null), null)
	const configured = {
		loader: { entries: () => [{ options: { name: '@deepseek-ai/dsh-host-webserver', config: { port: () => 6666 } } }] },
	}
	assert.equal(webPort(configured, null), 6666, '!!js 函数形式的端口配置应被求值')
})
