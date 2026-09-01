import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { __builders } from '../lib/index.js'

const { isEnginePlatform, ENGINE_PLATFORM_NOTE } = __builders

test('平台防护：仅 win32 放行升级/重启引擎', () => {
	assert.equal(isEnginePlatform('win32'), true, 'win32 应放行')
	assert.equal(isEnginePlatform('darwin'), false, 'macOS 应拒绝')
	assert.equal(isEnginePlatform('linux'), false, 'Linux 应拒绝')
	assert.equal(isEnginePlatform('freebsd'), false, 'FreeBSD 应拒绝')
})

test('平台防护：默认取当前 process.platform，提示文案存在且可读', () => {
	assert.equal(isEnginePlatform(), isEnginePlatform(process.platform), '无参调用应与显式传入 process.platform 一致')
	assert.equal(typeof ENGINE_PLATFORM_NOTE, 'string')
	assert.ok(ENGINE_PLATFORM_NOTE.length > 0, '平台限制提示不应为空')
	assert.ok(ENGINE_PLATFORM_NOTE.includes('Windows'), '提示应点名 Windows 依赖')
})

test('平台防护：客户端禁用依赖服务端下发的 engineSupported（契约锚定）', () => {
	// client.js 必须读取 /state 返回的 engineSupported 来决定是否禁用升级/重启按钮，
	// 与服务端 handle() 里 `engineSupported: isEnginePlatform()` 的契约一致。
	const clientSrc = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
	assert.ok(clientSrc.includes('state?.engineSupported'), 'client 应读取 state.engineSupported')
	assert.ok(clientSrc.includes('engineOk'), 'client 应计算 engineOk 并用于按钮禁用')
	assert.ok(clientSrc.includes('platformBlocked'), 'client 应有平台限制提示文案 key')
	assert.ok(clientSrc.includes('disabled: busy || !engineOk'), '升级/重启按钮应被平台状态禁用')
})
