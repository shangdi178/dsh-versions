import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractFromTar, parseExportNames, scanSettingsImports } from '../lib/compat.js'

/** 构造一个最小 tar 缓冲（单文件，ustar 布局）。 */
function buildTar(entries) {
	const blocks = []
	for (const [name, content] of entries) {
		const header = Buffer.alloc(512, 0)
		header.write(name, 0, Math.min(name.length, 100), 'utf8')
		header.write(content.length.toString(8).padStart(11, '0') + '\0', 124, 12, 'utf8')
		header.write('0', 156, 1, 'utf8')
		const body = Buffer.from(content, 'utf8')
		blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512, 0))
	}
	blocks.push(Buffer.alloc(1024, 0))
	return Buffer.concat(blocks)
}

test('tar 提取：精确路径与尾部斜杠前缀都能命中', () => {
	const tar = buildTar([
		['package/lib/index.js', 'export { A };'],
		['package/README.md', 'readme'],
	])
	assert.equal(extractFromTar(tar, 'package/lib/index.js'), 'export { A };')
	assert.equal(extractFromTar(tar, 'lib/index.js'), 'export { A };')
	assert.equal(extractFromTar(tar, 'package/missing.js'), null)
})

test('tar 提取：内容跨多个 512 块时完整还原', () => {
	const big = 'x'.repeat(1500)
	const tar = buildTar([['package/lib/index.js', big]])
	assert.equal(extractFromTar(tar, 'package/lib/index.js'), big)
})

test('parseExportNames：普通导出与 as 重命名', () => {
	const names = parseExportNames('export { SettingsConflictError, SettingsProvider as default, deepEqualJson, installSettingsSection, redactSecrets, settingsNamespace };')
	assert.equal(names.size, 6)
	assert.ok(names.has('settingsNamespace'))
	assert.ok(names.has('installSettingsSection'))
	assert.ok(names.has('default')) // SettingsProvider as default
})

test('scanSettingsImports：静态具名导入 + as 绑定取原始名', () => {
	const source = [
		'import { settingsNamespace } from "@deepseek-ai/dsh-settings";',
		`import { installSettingsSection as installSection, SettingsConflictError } from '@deepseek-ai/dsh-settings';`,
		'import { somethingElse } from "other-pkg";',
	].join('\n')
	const names = scanSettingsImports(source)
	assert.ok(names.has('settingsNamespace'))
	assert.ok(names.has('installSettingsSection')) // 导入侧按导出名比对
	assert.ok(names.has('SettingsConflictError'))
	assert.ok(!names.has('somethingElse'))
	assert.ok(!names.has('installSection'))
})
