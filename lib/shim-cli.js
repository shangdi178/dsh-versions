/**
 * dsh-versions 垫片 CLI —— 供升级脚本在「安装完成」与「重启服务」之间调用，
 * 让已启用的兼容性垫片在第一次重启前就写好（否则崩溃进程 apply() 时机太晚）。
 *
 * 用法：
 *   node shim-cli.js reconcile --fw <版本> --dsh-dir <框架目录> --data-dir <数据目录>
 *                             --backup-root <备份根目录> [--node <node.exe>]
 *
 * 只处理「已启用」的垫片；输出一行 JSON；绝不抛异常（用 exit 码表达结果）。
 */
import { join } from 'node:path'
import { reconcileShims } from './shim.js'

function arg(name) {
	const flag = '--' + name
	const i = process.argv.indexOf(flag)
	return i !== -1 ? process.argv[i + 1] : undefined
}

const fw = arg('fw')
const dshDir = arg('dsh-dir')
const dataDir = arg('data-dir')
const backupRoot = arg('backup-root')
const nodePath = arg('node') ?? process.execPath

if (!fw || !dshDir || !dataDir) {
	console.log(JSON.stringify({ ok: false, error: '缺少参数：--fw / --dsh-dir / --data-dir' }))
	process.exit(1)
}

try {
	const results = reconcileShims({
		fwVersion: fw,
		dshDir,
		dataDir,
		backupRoot: backupRoot ?? join(dataDir, 'backups'),
		nodePath,
	})
	console.log(JSON.stringify({ ok: true, results }))
	process.exit(0)
} catch (error) {
	console.log(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }))
	process.exit(1)
}
