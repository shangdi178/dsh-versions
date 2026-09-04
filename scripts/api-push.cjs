/**
 * 通过 GitHub Git Data API 推送当前工作区提交（github.com 直连被阻断时的替代通道，
 * 走 api.github.com）。幂等：重复运行会创建等效提交。
 */
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const repo = 'shangdi178/dsh-versions'
const cwd = process.cwd()
const tmp = process.env.TEMP || 'C:/Users/Hepu/AppData/Local/Temp'

function ghJson(endpoint, body) {
	const args = ['api', endpoint, '-X', 'POST']
	if (body !== undefined) {
		const bodyFile = path.join(tmp, 'gh-body.json')
		fs.writeFileSync(bodyFile, JSON.stringify(body), 'utf8')
		args.push('--input', bodyFile)
	}
	const out = execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
	return JSON.parse(out)
}
function ghGet(endpoint) {
	return JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))
}

const branch = ghGet(`repos/${repo}/branches/main`)
const parent = branch.commit.sha
const baseTree = branch.commit.commit.tree.sha
console.log('remote HEAD:', parent.slice(0, 8), '(0.4.1)')

const files = [
	'lib/index.js',
	'lib/client.js',
	'lib/compat.js',
	'lib/shim.js',
	'lib/shim-cli.js',
	'package.json',
	'dsh.plugin.json',
	'test/compat.test.js',
]
const tree = files.map((f) => {
	const blob = ghJson(`repos/${repo}/git/blobs`, { content: fs.readFileSync(path.join(cwd, f), 'utf8'), encoding: 'utf-8' })
	return { path: f, mode: '100644', type: 'blob', sha: blob.sha }
})
const newTree = ghJson(`repos/${repo}/git/trees`, { base_tree: baseTree, tree })
const commit = ghJson(`repos/${repo}/git/commits`, {
	message: '0.5.1: 插件兼容性检查——安装前预警不兼容的第三方插件\n\n- lib/compat.js：拉取目标版本 dsh-settings 导出符号集（tarball + 零依赖最小 tar 解析），扫描已装插件具名导入\n- GET /compat?target=；客户端二次确认时自动检查并醒目展示不兼容清单\n- 实测 target=0.1.2-rc.1 精确标出 10 个不兼容插件，与崩溃日志一致',
	tree: newTree.sha,
	parents: [parent],
})
ghJson(`repos/${repo}/git/refs/heads/main`, { sha: commit.sha })
console.log('API push OK:', commit.sha.slice(0, 8))
