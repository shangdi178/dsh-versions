import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { reconcileShims } from '../lib/shim.js'

const MARKER = 'dsh-versions: legacy-settings-api shim'
const ORIGINAL = 'export const value = 1\n'
const APPLIED = ORIGINAL + '\n/* ' + MARKER + ' — test marker */\nexport const dv = 2\n'

function setup(fwVersion) {
	const root = mkdtempSync(join(tmpdir(), 'dshv-shim-'))
	const dataDir = join(root, 'data')
	const dshDir = join(root, 'dsh')
	const targetDir = join(dshDir, 'node_modules', '@deepseek-ai', 'dsh-settings', 'lib')
	mkdirSync(targetDir, { recursive: true })
	mkdirSync(join(dataDir, 'shims', 'legacy-settings-api'), { recursive: true })
	writeFileSync(join(targetDir, 'index.js'), APPLIED, 'utf8')
	writeFileSync(join(dataDir, 'shims', 'legacy-settings-api', 'index.js.orig'), ORIGINAL, 'utf8')
	writeFileSync(join(dataDir, 'shims', 'enabled.json'), JSON.stringify({ 'legacy-settings-api': true }), 'utf8')
	return { root, dataDir, dshDir, fwVersion, nodePath: process.execPath, backupRoot: join(root, 'backups') }
}

const targetFile = (deps) => join(deps.dshDir, 'node_modules', '@deepseek-ai', 'dsh-settings', 'lib', 'index.js')

test('reconcileShims：版本离开 0.1.2 系列后，已启用的垫片必须卸载（回归：一直残留）', () => {
	const deps = setup('0.2.0')
	const results = reconcileShims(deps)
	const r = results.find((x) => x.id === 'legacy-settings-api')
	assert.equal(r?.action, 'removed')
	assert.equal(r?.ok, true, r?.error)
	const content = readFileSync(targetFile(deps), 'utf8')
	assert.equal(content, ORIGINAL)
	assert.ok(!content.includes(MARKER))
	rmSync(deps.root, { recursive: true, force: true })
})

test('reconcileShims：仍在 0.1.2 系列时即使依赖暂时缺失也不误卸', () => {
	const deps = setup('0.1.2-alpha.4')
	const results = reconcileShims(deps)
	assert.equal(results.filter((x) => x.id === 'legacy-settings-api' && x.action === 'removed').length, 0)
	assert.ok(readFileSync(targetFile(deps), 'utf8').includes(MARKER), '仍生效的垫片不应被误卸')
	rmSync(deps.root, { recursive: true, force: true })
})

test('reconcileShims：新版本上不重新应用旧垫片（回归：0.2.0 被误打 0.1.2 补丁）', () => {
	const deps = setup('0.2.0')
	// 模拟全新安装的 0.2.0：文件干净、没有垫片标记，但 enabled.json 仍记录启用
	writeFileSync(targetFile(deps), ORIGINAL, 'utf8')
	const results = reconcileShims(deps)
	const r = results.find((x) => x.id === 'legacy-settings-api')
	assert.equal(r?.action, 'skipped')
	assert.equal(readFileSync(targetFile(deps), 'utf8'), ORIGINAL, '不适用版本不得被写入垫片块')
	rmSync(deps.root, { recursive: true, force: true })
})
