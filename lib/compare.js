/**
 * dsh-versions — 版本号解析与比较（零依赖 semver 子集）。
 *
 * 支持 `v` 前缀、三段数字核心版本、`-预发布.标识` 后缀与 `+构建` 忽略，
 * 比较规则与 semver 一致：核心版本逐段比数字；有预发布 < 无预发布；
 * 预发布标识逐段比，数字标识按数值、字母标识按字典序，数字 < 字母，
 * 短的一方缺段视为更小。
 */

/** 解析版本号；非法输入返回 null。 */
export function parseVersion(input) {
	if (typeof input !== 'string') return null
	const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u.exec(input.trim())
	if (m === null) return null
	return {
		core: [Number(m[1]), Number(m[2]), Number(m[3])],
		pre: m[4] === undefined ? null : m[4].split('.'),
	}
}

function comparePrerelease(a, b) {
	if (a === null && b === null) return 0
	if (a === null) return 1
	if (b === null) return -1
	const len = Math.max(a.length, b.length)
	for (let i = 0; i < len; i += 1) {
		const x = a[i]
		const y = b[i]
		if (x === undefined) return -1
		if (y === undefined) return 1
		const xNum = /^\d+$/u.test(x)
		const yNum = /^\d+$/u.test(y)
		if (xNum && yNum) {
			const d = Number(x) - Number(y)
			if (d !== 0) return d < 0 ? -1 : 1
		} else if (xNum !== yNum) {
			return xNum ? -1 : 1
		} else if (x !== y) {
			return x < y ? -1 : 1
		}
	}
	return 0
}

/**
 * 比较两个版本号：a < b 返回 -1，相等返回 0，a > b 返回 1；
 * 任一无法解析时返回 null（调用方应视为"未知"，不得当作可更新）。
 */
export function compareVersions(a, b) {
	const x = parseVersion(a)
	const y = parseVersion(b)
	if (x === null || y === null) return null
	for (let i = 0; i < 3; i += 1) {
		if (x.core[i] !== y.core[i]) return x.core[i] < y.core[i] ? -1 : 1
	}
	return comparePrerelease(x.pre, y.pre)
}
