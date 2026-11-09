import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { __builders } from '../lib/index.js'

const { buildUpgradeScript, buildRelaunchScript } = __builders

const p = {
	stateFile: 'C:\\Users\\t\\.dsh\\dsh-versions\\upgrade-state.txt',
	logFile: 'C:\\Users\\t\\.dsh\\dsh-versions\\upgrade.log',
	historyFile: 'C:\\Users\\t\\.dsh\\dsh-versions\\history.jsonl',
	dshDir: 'C:\\Users\\t\\AppData\\Roaming\\npm\\node_modules\\@deepseek-ai\\dsh',
	rollbackDir: 'C:\\Users\\t\\.dsh\\dsh-versions\\backups\\0.1.1-rc.2-2026-01-01\\dsh-package-backup',
	nodePath: 'C:\\Program Files\\nodejs\\node.exe',
	npmCliJs: 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js',
	shimCliJs: 'C:\\Users\\t\\dsh-versions\\lib\\shim-cli.js',
	dshHome: 'C:\\Users\\t\\.dsh',
	dataDir: 'C:\\Users\\t\\.dsh\\dsh-versions',
	backupRoot: 'C:\\Users\\t\\.dsh\\dsh-versions\\backups',
	binPath: 'C:\\Users\\t\\AppData\\Roaming\\npm\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js',
	port: 3080,
	target: '0.1.2-alpha.3',
	from: '0.1.1-rc.2',
	taskName: 'DSH-VER-Upgrade-123',
}

/** 用 PowerShell 自带 AST 解析器做纯语法校验（不执行脚本）。 */
function assertParses(file) {
	const escaped = file.replace(/'/gu, "''")
	const command = [
		'$tokens = $null; $errors = $null',
		`[System.Management.Automation.Language.Parser]::ParseFile('${escaped}', [ref]$tokens, [ref]$errors) | Out-Null`,
		'if ($errors.Count -gt 0) { $errors | ForEach-Object { $_.Message }; exit 1 }',
	].join('; ')
	execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { stdio: 'pipe' })
}

test('PowerShell 生成脚本通过 AST 语法解析（升级 + 重启）', { skip: process.platform !== 'win32' }, (t) => {
	const dir = mkdtempSync(join(tmpdir(), 'dshv-ps-'))
	try {
		const upgrade = join(dir, 'upgrade.ps1')
		const relaunch = join(dir, 'relaunch.ps1')
		writeFileSync(upgrade, buildUpgradeScript(p), 'utf8')
		writeFileSync(relaunch, buildRelaunchScript(p), 'utf8')
		for (const file of [upgrade, relaunch]) {
			try {
				assertParses(file)
			} catch (error) {
				// 受限沙箱会禁止 spawn 子进程：此时跳过，不把环境限制误报成脚本语法错误
				if (error?.code === 'EPERM') {
					t.skip('当前沙箱禁止启动 PowerShell 子进程，跳过 AST 校验')
					return
				}
				throw error
			}
		}
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
})
