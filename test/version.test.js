import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareVersions, parseVersion } from '../lib/compare.js'

test('核心版本逐段比较', () => {
	assert.equal(compareVersions('1.39.0', '1.33.0'), 1)
	assert.equal(compareVersions('0.3.6', '0.3.3'), 1)
	assert.equal(compareVersions('0.10.0', '0.9.9'), 1)
	assert.equal(compareVersions('1.2.3', '1.2.3'), 0)
	assert.equal(compareVersions('1.2.3', '1.2.4'), -1)
	assert.equal(compareVersions('2.0.0', '1.99.99'), 1)
})

test('容忍 v 前缀与构建元数据', () => {
	assert.equal(compareVersions('v1.2.3', '1.2.3'), 0)
	assert.equal(compareVersions('1.2.3+build.7', '1.2.3'), 0)
})

test('预发布版本低于正式版本', () => {
	assert.equal(compareVersions('0.1.1-rc.2', '0.1.1'), -1)
	assert.equal(compareVersions('0.1.1', '0.1.1-rc.2'), 1)
	assert.equal(compareVersions('0.1.2-alpha.3', '0.1.2'), -1)
})

test('预发布标识逐段比较', () => {
	assert.equal(compareVersions('0.1.2-alpha.3', '0.1.2-alpha.2'), 1)
	assert.equal(compareVersions('0.1.1-rc.2', '0.1.1-rc.1'), 1)
	assert.equal(compareVersions('0.1.1-rc.2', '0.1.1-alpha.1'), 1)
	assert.equal(compareVersions('0.1.1-alpha', '0.1.1-alpha.1'), -1)
	assert.equal(compareVersions('0.1.1-2', '0.1.1-10'), -1)
})

test('非法输入返回 null 而不是误判可更新', () => {
	assert.equal(parseVersion('not-a-version'), null)
	assert.equal(parseVersion(null), null)
	assert.equal(compareVersions('0.1.1-rc.2', 'latest'), null)
})

test('parseVersion 结构', () => {
	assert.deepEqual(parseVersion('1.2.3'), { core: [1, 2, 3], pre: null })
	assert.deepEqual(parseVersion('0.1.1-rc.2'), { core: [0, 1, 1], pre: ['rc', '2'] })
})
