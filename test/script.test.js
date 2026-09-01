import { test } from 'node:test'
import assert from 'node:assert/strict'
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
	dshHome: 'C:\\Users\\t\\.dsh',
	binPath: 'C:\\Users\\t\\AppData\\Roaming\\npm\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js',
	port: 3080,
	target: '0.1.2-alpha.3',
	from: '0.1.1-rc.2',
	taskName: 'DSH-VER-Upgrade-123',
}

test('升级脚本：npm 命令行的 registry 必须拼在同一行（回归：PS 数组 + 拼接拆行 → cmd 9009）', () => {
	const s = buildUpgradeScript(p)
	// 修复后的形态：整体加括号的拼接，registry 作为同一数组元素的一部分
	assert.ok(s.includes("@('@echo off', ('\""), 'cmdLines 第二个元素应被括号包住')
	assert.ok(s.includes('--registry ' + "' + $reg)"), 'registry 拼接应整体在括号内（+ $reg) 收尾）')
	// 明确禁止旧的拆行形态：裸拼接导致 registry 变成独立元素
	assert.ok(!s.includes("--registry ' + $reg,"), '不得出现裸拼接（无括号）的旧形态')
	assert.ok(s.includes('@deepseek-ai/dsh@0.1.2-alpha.3 --force --registry '), '安装命令应含目标版本与 --force')
	// 磁盘版本校验点存在
	assert.ok(s.includes('Get-Content '), '应读取磁盘 package.json 校验版本')
	assert.ok(s.includes('robocopy '), '应含回滚用的 robocopy')
	assert.ok(s.includes('schtasks /delete /f /tn DSH-VER-Upgrade-123'), '脚本末尾应自删任务')
})

test('升级脚本：端口工具与拉起（回归：Get-NetTCPConnection 看不见高完整性监听者 → 假拉起失败）', () => {
	const s = buildUpgradeScript(p)
	assert.ok(s.includes('function Get-ListenerPid($port) {'), '应定义 netstat 回退的监听 PID 查找')
	assert.ok(s.includes('function Stop-Listener($port) {'), '应定义 Stop-Listener')
	assert.ok(s.includes('function Test-Port($port) {'), '应定义 HTTP 探活就绪检查')
	assert.ok(s.includes('Invoke-WebRequest'), 'Test-Port 应使用 HTTP 探活而非仅 Get-NetTCPConnection')
	assert.ok(s.includes('-WorkingDirectory $env:USERPROFILE'), '拉起服务应带工作目录（避免 system32 cwd）')
	assert.ok(s.includes('-RedirectStandardOutput '), '拉起服务应重定向 stdout 便于诊断')
	assert.ok(s.includes('-RedirectStandardError '), '拉起服务应重定向 stderr 便于诊断')
})

test('重启脚本：同样使用端口工具 + HTTP 探活 + 输出重定向', () => {
	const s = buildRelaunchScript(p)
	assert.ok(s.includes('function Test-Port($port) {'), '重启脚本应定义 Test-Port')
	assert.ok(s.includes('function Stop-Listener($port) {'), '重启脚本应定义 Stop-Listener')
	assert.ok(s.includes('-WorkingDirectory $env:USERPROFILE'), '重启脚本拉起服务应带工作目录')
	assert.ok(s.includes('-RedirectStandardOutput '), '重启脚本应重定向 stdout')
	assert.ok(s.includes('-RedirectStandardError '), '重启脚本应重定向 stderr')
	assert.ok(s.includes('schtasks /delete /f /tn DSH-VER-Upgrade-123'), '重启脚本末尾应自删任务')
})
