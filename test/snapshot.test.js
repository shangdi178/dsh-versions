import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, readFileSync, statSync, existsSync, readdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
	createSnapshot,
	listSnapshots,
	restoreSnapshot,
	removeSnapshot,
	pruneSnapshots,
	isValidSnapshot,
} from '../lib/snapshot.js'

/** 在临时目录里搭一个假的 dsh 安装目录。 */
function makeInstall(version, contents = {}) {
	const dir = mkdtempSync(join(tmpdir(), 'dshv-snap-install-'))
	writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version }), 'utf8')
	for (const [name, text] of Object.entries(contents)) {
		const p = join(dir, name)
		mkdirSync(join(p, '..'), { recursive: true })
		writeFileSync(p, text, 'utf8')
	}
	return dir
}

const snapDir = () => mkdtempSync(join(tmpdir(), 'dshv-snap-store-'))
const cleanup = (...dirs) => { for (const d of dirs) rmSync(d, { recursive: true, force: true }) }

test('createSnapshot：完整复制 + meta.json + 临时目录改名（无 .tmp 残留）', () => {
	const install = makeInstall('0.1.1-rc.2', { 'lib/bin.js': 'x' })
	const store = snapDir()
	const r = createSnapshot({ installDir: install, snapshotsDir: store, version: '0.1.1-rc.2', keep: 5 })
	assert.equal(r.ok, true)
	const dest = join(store, '0.1.1-rc.2')
	assert.equal(existsSync(dest), true)
	assert.equal(existsSync(join(dest, 'lib', 'bin.js')), true)
	assert.equal(existsSync(join(dest, 'meta.json')), true)
	const meta = JSON.parse(readFileSync(join(dest, 'meta.json'), 'utf8'))
	assert.equal(meta.version, '0.1.1-rc.2')
	assert.equal(typeof meta.at, 'number')
	// 无临时残留
	assert.ok(!readdirSync(store).some((n) => n.startsWith('.tmp-')), '不应有 .tmp- 残留')
	cleanup(install, store)
})

test('createSnapshot：同版本健康快照复用，同版本损坏快照被替换', () => {
	const install = makeInstall('1.2.3')
	const store = snapDir()
	assert.equal(createSnapshot({ installDir: install, snapshotsDir: store, version: '1.2.3', keep: 5 }).ok, true)
	const dest = join(store, '1.2.3')
	const mtime1 = statSync(dest).mtimeMs
	// 复用：不重新写（时间戳不变，meta.at 不变）
	const r2 = createSnapshot({ installDir: install, snapshotsDir: store, version: '1.2.3', keep: 5 })
	assert.equal(r2.ok, true)
	assert.equal(r2.reused, true)
	assert.equal(statSync(dest).mtimeMs, mtime1, '复用不应重写目录')
	// 破坏 meta.json → 视为损坏 → 下次创建会替换
	rmSync(join(dest, 'meta.json'))
	assert.equal(isValidSnapshot(dest, '1.2.3'), false)
	const r3 = createSnapshot({ installDir: install, snapshotsDir: store, version: '1.2.3', keep: 5 })
	assert.equal(r3.ok, true)
	assert.equal(existsSync(join(dest, 'meta.json')), true, '损坏快照应被重建')
	cleanup(install, store)
})

test('listSnapshots：损坏目录仍列出且标 usable=false，健康者 usable=true，新→旧排序', () => {
	const install = makeInstall('2.0.0')
	const store = snapDir()
	createSnapshot({ installDir: install, snapshotsDir: store, version: '2.0.0', keep: 5 })
	// 制造一个损坏快照目录
	mkdirSync(join(store, '1.0.0'))
	writeFileSync(join(store, '1.0.0', 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '1.0.0' }), 'utf8')
	const list = listSnapshots(store)
	assert.equal(list.length, 2)
	const byVer = Object.fromEntries(list.map((e) => [e.version, e]))
	assert.equal(byVer['2.0.0'].usable, true)
	assert.equal(byVer['1.0.0'].usable, false)
	cleanup(install, store)
})

test('restoreSnapshot：把快照复制回安装目录，内容与版本一致', () => {
	const install = makeInstall('0.5.0', { 'lib/bin.js': 'old' })
	const store = snapDir()
	createSnapshot({ installDir: install, snapshotsDir: store, version: '0.5.0', keep: 5 })
	// 模拟安装目录被改成另一版本
	writeFileSync(join(install, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '9.9.9' }), 'utf8')
	rmSync(join(install, 'lib'), { recursive: true })
	const r = restoreSnapshot({ installDir: install, snapshotsDir: store, version: '0.5.0' })
	assert.equal(r.ok, true)
	const pkg = JSON.parse(readFileSync(join(install, 'package.json'), 'utf8'))
	assert.equal(pkg.version, '0.5.0', '恢复后 package.json 应回到快照版本')
	assert.equal(readFileSync(join(install, 'lib', 'bin.js'), 'utf8'), 'old')
	// 无 .replaced- 残留
	assert.ok(!existsSync(`${install}.replaced-`), '不应有 replaced 残留')
	cleanup(install, store)
})

test('restoreSnapshot：拒绝恢复不存在/损坏/非法版本', () => {
	const install = makeInstall('3.3.3')
	const store = snapDir()
	createSnapshot({ installDir: install, snapshotsDir: store, version: '3.3.3', keep: 5 })
	assert.equal(restoreSnapshot({ installDir: install, snapshotsDir: store, version: '9.9.9' }).ok, false)
	assert.equal(restoreSnapshot({ installDir: install, snapshotsDir: store, version: 'not-a-version' }).ok, false)
	// 损坏快照不可恢复
	mkdirSync(join(store, '2.2.2'))
	writeFileSync(join(store, '2.2.2', 'package.json'), 'broken', 'utf8')
	assert.equal(restoreSnapshot({ installDir: install, snapshotsDir: store, version: '2.2.2' }).ok, false)
	cleanup(install, store)
})

test('removeSnapshot：按版本删除，非法版本名拒绝', () => {
	const store = snapDir()
	const install = makeInstall('4.4.4')
	createSnapshot({ installDir: install, snapshotsDir: store, version: '4.4.4', keep: 5 })
	assert.equal(removeSnapshot(store, '4.4.4'), true)
	assert.equal(existsSync(join(store, '4.4.4')), false)
	assert.equal(removeSnapshot(store, '4.4.4'), false)
	assert.equal(removeSnapshot(store, '../evil'), false)
	cleanup(install, store)
})

test('pruneSnapshots：损坏优先清，再按保留数清最旧健康快照', () => {
	const store = snapDir()
	let clock = 1_000_000
	const now = () => clock++
	for (const v of ['0.1.0', '0.2.0', '0.3.0', '0.4.0', '0.5.0']) {
		// 每个版本的快照必须来自“该版本自己的安装树”才会被判定健康
		const install = makeInstall(v)
		createSnapshot({ installDir: install, snapshotsDir: store, version: v, keep: 5, now })
		rmSync(install, { recursive: true, force: true })
	}
	// 造一个损坏快照
	mkdirSync(join(store, '9.9.9'))
	writeFileSync(join(store, '9.9.9', 'package.json'), 'nope', 'utf8')
	pruneSnapshots(store, 3)
	const names = readdirSync(store)
	assert.ok(!names.includes('9.9.9'), '损坏快照应被优先清除')
	// keep=3：0.3.0/0.4.0/0.5.0 保留，0.1.0/0.2.0 被清
	assert.ok(!names.includes('0.1.0') && !names.includes('0.2.0'), '最旧的健康快照应被清出保留数之外')
	assert.ok(names.includes('0.3.0') && names.includes('0.4.0') && names.includes('0.5.0'))
	cleanup(store)
})
