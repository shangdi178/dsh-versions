window.__ModuleLoader__.load({
	id: "dsh-versions",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react = require("react");
		const h = react.createElement;

		//#region styles
		const css = ".dv_section{width:100%;max-width:760px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:12px;display:flex}.dv_head{align-items:center;justify-content:space-between;display:flex}.dv_head h3{margin:0;font-size:13px;font-weight:600;line-height:20px}.dv_note{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;margin:0}.dv_message{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px;margin:0}.dv_message[data-error=true]{color:var(--dsw-alias-state-error-primary)}.dv_btn{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);background:0 0;font:inherit;cursor:pointer;border-radius:6px;padding:4px 14px;flex:none}.dv_btn:hover:not(:disabled){border-color:var(--dsw-alias-state-business-primary)}.dv_btn:disabled{opacity:.5;cursor:default}.dv_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:10px;padding:10px 12px;flex-direction:column;gap:6px;display:flex}.dv_row{align-items:center;gap:8px;display:flex}.dv_name{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}.dv_ver{color:var(--dsw-alias-label-secondary);font-size:12px;flex:none}.dv_table{width:100%;border-collapse:collapse;font-size:12px}.dv_table th{color:var(--dsw-alias-label-tertiary);font-size:11px;font-weight:500;text-align:left;padding:4px 8px;border-bottom:1px solid var(--dsw-alias-border-l2);white-space:nowrap}.dv_table td{padding:5px 8px;border-bottom:1px solid var(--dsw-alias-border-l2);vertical-align:middle}.dv_table tr:last-child td{border-bottom:0}.dv_mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px}.dv_nameCell{max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dv_chip{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);border-radius:999px;padding:1px 8px;font-size:11px;line-height:16px;display:inline-block;white-space:nowrap}.dv_chip[data-status=ok]{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}.dv_chip[data-status=update]{border-color:var(--dsw-alias-state-warning-primary);color:var(--dsw-alias-state-warning-primary)}.dv_chip[data-status=muted]{opacity:.75}.dv_arrow{color:var(--dsw-alias-state-warning-primary);font-size:11px;margin-left:6px}";
		if (typeof document !== "undefined" && document.querySelector('style[data-plugin="dsh-versions"]') === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-versions";
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion

		const NS = "dsh-versions";
		const zh = {
			tab: "版本",
			title: "版本总览",
			refresh: "检查更新",
			checking: "检查中…",
			loading: "正在读取版本清单…",
			loadError: "暂时无法读取版本信息。",
			framework: "dsh 主程序",
			plugins: "已安装插件",
			colName: "组件",
			colInstalled: "已装版本",
			colLatest: "最新版本",
			colStatus: "状态",
			upToDate: "已是最新",
			updatable: "可更新",
			frameworkOnly: "随框架升级",
			notOnNpm: "npm 上不存在",
			queryFailed: "查询失败",
			neverChecked: "尚未检查更新",
			checkedAt: "检查于",
			noState: "版本未知",
		};
		const en = {
			tab: "Versions",
			title: "Version overview",
			refresh: "Check updates",
			checking: "Checking…",
			loading: "Loading versions…",
			loadError: "Failed to load version info.",
			framework: "dsh host",
			plugins: "Installed plugins",
			colName: "Component",
			colInstalled: "Installed",
			colLatest: "Latest",
			colStatus: "Status",
			upToDate: "Up to date",
			updatable: "Update available",
			frameworkOnly: "Upgrades with host",
			notOnNpm: "Not on npm",
			queryFailed: "Query failed",
			neverChecked: "Never checked",
			checkedAt: "Checked at",
			noState: "unknown",
		};

		async function call(path) {
			const response = await fetch(path);
			let data = null;
			try {
				data = await response.json();
			} catch {}
			if (!response.ok || (data !== null && data.ok === false)) {
				throw new Error(data !== null && typeof data.error === "string" ? data.error : "HTTP " + response.status);
			}
			return data;
		}

		function statusChip(kind, text) {
			return h("span", { className: "dv_chip", "data-status": kind }, text);
		}

		/** 单行状态：updates 行（u）为空表示还没查过。 */
		function statusCell(u, t) {
			if (!u) return h("span", { className: "dv_note" }, "—");
			if (u.note === "framework") return statusChip("muted", t("frameworkOnly"));
			if (u.note === "not-on-npm") return statusChip("muted", t("notOnNpm"));
			if (u.note === "query-failed") return statusChip("muted", t("queryFailed"));
			if (u.updateAvailable) {
				return h("span", null, statusChip("update", t("updatable")), h("span", { className: "dv_arrow dv_mono" }, `${u.installed} → ${u.latest}`));
			}
			return statusChip("ok", t("upToDate"));
		}

		function VersionTab({ t }) {
			const [state, setState] = react.useState(null);
			const [loadError, setLoadError] = react.useState(null);
			const [updates, setUpdates] = react.useState(null);
			const [checking, setChecking] = react.useState(false);
			const [checkError, setCheckError] = react.useState(null);
			react.useEffect(() => {
				let alive = true;
				call("/dsh-versions/state").then(
					(data) => { if (alive) setState(data); },
					(e) => { if (alive) setLoadError(e); },
				);
				return () => { alive = false; };
			}, []);
			const onCheck = () => {
				setChecking(true);
				setCheckError(null);
				call("/dsh-versions/updates").then(
					(data) => { setUpdates(data); setChecking(false); },
					(e) => { setCheckError(e); setChecking(false); },
				);
			};
			if (loadError !== null) {
				const msg = loadError !== null && typeof loadError.message === "string" ? `（${loadError.message}）` : "";
				return h("section", { className: "dv_section" },
					h("p", { className: "dv_message", "data-error": "true" }, t("loadError") + msg));
			}
			if (state === null) {
				return h("section", { className: "dv_section" },
					h("p", { className: "dv_message" }, t("loading")));
			}
		const rows = state.packages ?? [];
		const findUpdate = (name) => updates !== null && Array.isArray(updates.results)
			? updates.results.find((r) => r.name === name) ?? null
			: null;
		/** 官方框架组件不做 npm 单独检查（随主程序整体升级），直接标注。 */
		const isFrameworkScoped = (name) => name.startsWith("@deepseek-ai/");
			const fw = updates !== null ? updates.framework : null;
			return h("section", { className: "dv_section" },
				h("div", { className: "dv_head" },
					h("h3", null, t("title")),
					h("button", { className: "dv_btn", onClick: onCheck, disabled: checking }, checking ? t("checking") : t("refresh"))),
				h("p", { className: "dv_note" }, updates !== null && typeof updates.checkedAt === "number"
					? `${t("checkedAt")} ${new Date(updates.checkedAt).toLocaleString()}`
					: t("neverChecked")),
				checkError !== null
					? h("p", { className: "dv_message", "data-error": "true" }, checkError !== null && typeof checkError.message === "string" ? checkError.message : String(checkError))
					: null,
				h("div", { className: "dv_card" },
					h("div", { className: "dv_row" },
						h("strong", { className: "dv_name" }, t("framework")),
						h("span", { className: "dv_ver dv_mono" }, state.framework?.version ?? t("noState")),
						statusCell(fw === null ? null : { ...fw, note: null }, t)),
					fw !== null && fw.updateAvailable
						? h("p", { className: "dv_note dv_mono" }, `${fw.installed ?? "?"} → ${fw.latest ?? "?"}`)
						: null),
				h("h3", null, t("plugins")),
				h("table", { className: "dv_table" },
					h("thead", null,
						h("tr", null,
							h("th", null, t("colName")),
							h("th", null, t("colInstalled")),
							h("th", null, t("colLatest")),
							h("th", null, t("colStatus")))),
					h("tbody", null, rows.map((p) => {
						const u = isFrameworkScoped(p.name) ? { note: "framework" } : findUpdate(p.name);
						const latest = u !== null && u.latest !== null ? u.latest : "—";
						return h("tr", { key: p.name },
							h("td", { className: "dv_nameCell", title: p.name }, p.name),
							h("td", { className: "dv_mono" }, p.version),
							h("td", { className: "dv_mono" }, latest),
							h("td", null, statusCell(u, t)));
					}))));
		}

		const inject = ["slots", "locale"];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-versions: dictionaries");
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
				name: "settings.plugins.tab",
				id: "versions",
				order: 30,
				label: () => t("tab"),
				locale: NS,
				inject: () => ({}),
			}, VersionTab));
		}
		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
