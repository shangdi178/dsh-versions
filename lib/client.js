window.__ModuleLoader__.load({
	id: "dsh-versions",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react = require("react");
		const h = react.createElement;

		//#region styles
		const css = ".dv_section{width:100%;max-width:760px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:12px;display:flex}.dv_head{align-items:center;justify-content:space-between;display:flex}.dv_head h3{margin:0;font-size:13px;font-weight:600;line-height:20px}.dv_note{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;margin:0}.dv_message{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px;margin:0}.dv_message[data-error=true]{color:var(--dsw-alias-state-error-primary)}.dv_btn{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);background:0 0;font:inherit;cursor:pointer;border-radius:6px;padding:4px 14px;flex:none}.dv_btn:hover:not(:disabled){border-color:var(--dsw-alias-state-business-primary)}.dv_btn:disabled{opacity:.5;cursor:default}.dv_btn[data-confirm=true]{border-color:var(--dsw-alias-state-warning-primary);color:var(--dsw-alias-state-warning-primary)}.dv_btnSmall{padding:2px 10px;font-size:12px}.dv_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:10px;padding:12px;flex-direction:column;gap:8px;display:flex}.dv_row{align-items:center;gap:10px;display:flex}.dv_name{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}.dv_verBig{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:16px;font-weight:600}.dv_ver{color:var(--dsw-alias-label-secondary);font-size:12px;flex:none}.dv_banner{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);border-radius:10px;padding:8px 12px;align-items:center;gap:10px;display:flex}.dv_banner[data-active=true]{border-color:var(--dsw-alias-state-business-primary)}.dv_banner[data-state=failed]{border-color:var(--dsw-alias-state-error-primary)}.dv_spinner{width:14px;height:14px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-state-business-primary);border-radius:50%;animation:dvspin 1s linear infinite;flex:none}@keyframes dvspin{to{transform:rotate(360deg)}}.dv_bannerText{font-size:12px;line-height:18px;flex:1}.dv_table{width:100%;border-collapse:collapse;font-size:12px}.dv_table th{color:var(--dsw-alias-label-tertiary);font-size:11px;font-weight:500;text-align:left;padding:4px 8px;border-bottom:1px solid var(--dsw-alias-border-l2);white-space:nowrap}.dv_table td{padding:5px 8px;border-bottom:1px solid var(--dsw-alias-border-l2);vertical-align:middle}.dv_table tr:last-child td{border-bottom:0}.dv_mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px}.dv_nameCell{max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dv_chip{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);border-radius:999px;padding:1px 8px;font-size:11px;line-height:16px;display:inline-block;white-space:nowrap}.dv_chip[data-kind=channel]{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}.dv_chip[data-kind=ok]{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}.dv_chip[data-kind=update]{border-color:var(--dsw-alias-state-warning-primary);color:var(--dsw-alias-state-warning-primary)}.dv_chip[data-kind=current]{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}.dv_chip[data-kind=muted]{opacity:.75}.dv_details{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:8px 12px}.dv_details summary{cursor:pointer;font-size:12px;color:var(--dsw-alias-label-secondary)}.dv_details[open]{padding-bottom:12px}.dv_detailsInner{margin-top:10px;flex-direction:column;gap:10px;display:flex}.dv_histRow{align-items:center;gap:10px;display:flex;font-size:12px}.dv_histText{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}";
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
			title: "dsh 版本管理",
			relaunch: "重启服务",
			relaunchStarted: "重启已发起：页面稍后会短暂断连，属正常现象；几秒后刷新即可。",
			loadError: "暂时无法读取版本信息。",
			platformBlocked: "当前平台不支持在线升级/重启（仅 Windows）：引擎依赖 robocopy / schtasks / Windows PowerShell 5.1。版本查看与更新检查不受影响。",
			framework: "dsh 主程序",
			currentVersion: "当前版本",
			unknown: "未知",
			channels: "渠道",
			releases: "npm 版本列表",
			releasesLoading: "正在读取 npm 版本列表…",
			releasesError: "暂时无法读取 npm 版本列表。",
			colVersion: "版本",
			colDate: "发布时间",
			colChannel: "渠道",
			colAction: "操作",
			install: "安装",
			reinstall: "重装",
			confirmInstall: "确认安装？",
			installedMarker: "当前",
			upgrading: "升级中",
			bannerIdle: "",
			history: "升级历史",
			historyEmpty: "还没有升级记录。",
			historyResult: { success: "成功", "rolled-back": "已回滚", failed: "失败" },
			restore: "恢复",
			upgradeStarted: "升级脚本已启动，进度如下（完成前后会自动重启服务）。",
			upgradeFailed409: "已有升级任务在运行。",
			pluginsTitle: "其他插件版本速览",
			checkUpdates: "检查插件更新",
			checking: "检查中…",
			pluginsLoading: "正在读取插件清单…",
			pluginsError: "暂时无法读取插件信息。",
			colName: "组件",
			colInstalled: "已装版本",
			colLatest: "最新版本",
			colStatus: "状态",
			upToDate: "已是最新",
			updatable: "可更新",
			frameworkOnly: "随框架升级",
			notOnNpm: "npm 上不存在",
			queryFailed: "查询失败",
			neverChecked: "尚未检查",
			checkedAt: "检查于",
		};
		const en = {
			tab: "Versions",
			title: "dsh version manager",
			relaunch: "Restart service",
			relaunchStarted: "Restart initiated: the page will disconnect briefly, which is normal; refresh in a few seconds.",
			loadError: "Failed to load version info.",
			platformBlocked: "Online upgrade/restart is not supported on this platform (Windows only): the engine relies on robocopy / schtasks / Windows PowerShell 5.1. Version listing and update checks still work.",
			framework: "dsh host",
			currentVersion: "Current version",
			unknown: "unknown",
			channels: "Channels",
			releases: "Published versions",
			releasesLoading: "Loading npm versions…",
			releasesError: "Failed to load npm versions.",
			colVersion: "Version",
			colDate: "Published",
			colChannel: "Channel",
			colAction: "Action",
			install: "Install",
			reinstall: "Reinstall",
			confirmInstall: "Confirm install?",
			installedMarker: "current",
			upgrading: "Upgrading",
			bannerIdle: "",
			history: "Upgrade history",
			historyEmpty: "No upgrades yet.",
			historyResult: { success: "success", "rolled-back": "rolled back", failed: "failed" },
			restore: "Restore",
			upgradeStarted: "Upgrade script started; progress below (the service restarts automatically at the end).",
			upgradeFailed409: "An upgrade is already running.",
			pluginsTitle: "Other plugins",
			checkUpdates: "Check plugin updates",
			checking: "Checking…",
			pluginsLoading: "Loading plugin list…",
			pluginsError: "Failed to load plugin info.",
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
		};

		async function call(path, body) {
			const response = await fetch(path, body === undefined
				? {}
				: { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
			let data = null;
			try {
				data = await response.json();
			} catch {}
			if (!response.ok || (data !== null && data.ok === false)) {
				throw new Error(data !== null && typeof data.error === "string" ? data.error : "HTTP " + response.status);
			}
			return data;
		}

		const ACTIVE_STATES = ["starting", "installing", "stopped", "rollback", "relaunching"];
		const isActiveStatus = (s) => typeof s === "string" && ACTIVE_STATES.includes(s);

		function chip(kind, text) {
			return h("span", { className: "dv_chip", "data-kind": kind }, text);
		}
		function fmtDate(value) {
			try { return new Date(value).toLocaleString(); } catch { return String(value ?? "—"); }
		}

		/** 渠道芯片行：latest/next/alpha 各一枚，当前所在渠道高亮。 */
		function channelChips(distTags, current) {
			const names = ["latest", "next", "alpha"];
			return h("div", { className: "dv_row" },
				names.map((name) => {
					const v = distTags?.[name];
					const isCurrent = v !== undefined && v === current;
					return chip(isCurrent ? "ok" : "channel", name + " " + (v ?? "—") + (isCurrent ? " ✓" : ""));
				}));
		}

		function DshCard({ t, state, releases }) {
			const current = state?.framework?.version ?? null;
			return h("div", { className: "dv_card" },
				h("div", { className: "dv_row" },
					h("strong", { className: "dv_name" }, t("framework")),
					h("span", { className: "dv_verBig dv_mono" }, current ?? t("unknown"))),
				releases !== null ? channelChips(releases.distTags, current) : null);
		}

		function ReleasesTable({ t, releases, current, busy, onInstall, confirmTarget }) {
			if (releases === null) {
				return h("p", { className: "dv_message" }, t("releasesLoading"));
			}
			const rows = releases.releases ?? [];
			return h("table", { className: "dv_table" },
				h("thead", null,
					h("tr", null,
						h("th", null, t("colVersion")),
						h("th", null, t("colDate")),
						h("th", null, t("colChannel")),
						h("th", null, t("colAction")))),
				h("tbody", null, rows.map((r) => {
					const isCurrent = r.version === current;
					const isConfirm = confirmTarget === r.version;
					const label = isCurrent ? t("reinstall") : t("install");
					return h("tr", { key: r.version },
						h("td", { className: "dv_mono" },
							r.version, " ",
							isCurrent ? chip("current", t("installedMarker")) : null),
						h("td", { className: "dv_note" }, fmtDate(r.date)),
						h("td", null, r.channels.length > 0
							? r.channels.map((c) => chip("channel", c))
							: h("span", { className: "dv_note" }, "—")),
						h("td", null,
							h("button", {
								className: "dv_btn dv_btnSmall",
								"data-confirm": isConfirm ? "true" : null,
								disabled: busy,
								onClick: () => onInstall(r.version),
							}, isConfirm ? t("confirmInstall") : label)));
				})));
		}

		function HistorySection({ t, history, busy, onRestore, confirmTarget }) {
			const items = history ?? [];
			return h("details", { className: "dv_details" },
				h("summary", null, t("history") + (items.length > 0 ? `（${items.length}）` : "")),
				h("div", { className: "dv_detailsInner" },
					items.length === 0 ? h("p", { className: "dv_message" }, t("historyEmpty")) : null,
					items.map((entry, index) => {
						const resultText = t("historyResult")[entry.result] ?? entry.result;
						const resultKind = entry.result === "success" ? "ok" : entry.result === "rolled-back" ? "update" : "muted";
						return h("div", { className: "dv_histRow", key: index },
							h("span", { className: "dv_note" }, fmtDate(entry.at)),
							h("span", { className: "dv_histText dv_mono" }, `${entry.from} → ${entry.to}`),
							chip(resultKind, resultText),
							h("button", {
								className: "dv_btn dv_btnSmall",
								"data-confirm": confirmTarget === "history:" + entry.from ? "true" : null,
								disabled: busy,
								onClick: () => onRestore(entry.from),
							}, (confirmTarget === "history:" + entry.from ? t("confirmInstall") : t("restore")) + " " + entry.from));
					})));
		}

		function PluginsSection({ t, state, isFrameworkScoped }) {
			const [updates, setUpdates] = react.useState(null);
			const [checking, setChecking] = react.useState(false);
			const [checkError, setCheckError] = react.useState(null);
			const onCheck = () => {
				setChecking(true);
				setCheckError(null);
				call("/dsh-versions/updates").then(
					(data) => { setUpdates(data); setChecking(false); },
					(e) => { setCheckError(e); setChecking(false); },
				);
			};
			const rows = state?.packages ?? [];
			const findUpdate = (name) => updates !== null && Array.isArray(updates.results)
				? updates.results.find((r) => r.name === name) ?? null
				: null;
			const statusCell = (u) => {
				if (!u) return h("span", { className: "dv_note" }, "—");
				if (u.note === "framework") return chip("muted", t("frameworkOnly"));
				if (u.note === "not-on-npm") return chip("muted", t("notOnNpm"));
				if (u.note === "query-failed") return chip("muted", t("queryFailed"));
				if (u.updateAvailable) return chip("update", t("updatable"));
				return chip("ok", t("upToDate"));
			};
			return h("details", { className: "dv_details" },
				h("summary", null, t("pluginsTitle")),
				h("div", { className: "dv_detailsInner" },
					h("div", { className: "dv_row" },
						updates !== null ? h("span", { className: "dv_note" }, `${t("checkedAt")} ${fmtDate(updates.checkedAt)}`) : h("span", null),
						h("button", { className: "dv_btn dv_btnSmall", onClick: onCheck, disabled: checking, style: { marginLeft: "auto" } }, checking ? t("checking") : t("checkUpdates"))),
					checkError !== null
						? h("p", { className: "dv_message", "data-error": "true" }, typeof checkError.message === "string" ? checkError.message : String(checkError))
						: null,
					rows.length === 0 ? h("p", { className: "dv_message" }, t("pluginsLoading")) : null,
					rows.length > 0 ? h("table", { className: "dv_table" },
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
								h("td", null, statusCell(u)));
						}))) : null));
		}

		function VersionTab({ t }) {
			const [state, setState] = react.useState(null);
			const [loadError, setLoadError] = react.useState(null);
			const [releases, setReleases] = react.useState(null);
			const [releasesError, setReleasesError] = react.useState(null);
			const [upStatus, setUpStatus] = react.useState(null);
			const [history, setHistory] = react.useState(null);
			const [confirmTarget, setConfirmTarget] = react.useState(null);
			const [notice, setNotice] = react.useState(null);
			const [actionError, setActionError] = react.useState(null);
			const refreshMeta = react.useCallback(() => {
				call("/dsh-versions/state").then((d) => setState(d), (e) => setLoadError(e));
				call("/dsh-versions/history").then((d) => setHistory(d.history ?? []), () => {});
			}, []);
			react.useEffect(() => {
				let alive = true;
				refreshMeta();
				call("/dsh-versions/releases").then((d) => { if (alive) setReleases(d); }, (e) => { if (alive) setReleasesError(e); });
				call("/dsh-versions/upgrade-status").then((d) => { if (alive) setUpStatus(d); }, () => {});
				return () => { alive = false; };
			}, [refreshMeta]);
			// 升级进行中每 3 秒轮询；到达终态时刷新清单与历史并停止轮询
			const active = isActiveStatus(upStatus?.status);
			react.useEffect(() => {
				if (!active) return;
				const timer = setInterval(() => {
					call("/dsh-versions/upgrade-status").then((d) => {
						setUpStatus((prev) => {
							if (isActiveStatus(d?.status)) return d;
							clearInterval(timer);
							refreshMeta();
							return d;
						});
					}, () => {});
				}, 3000);
				return () => clearInterval(timer);
			}, [active, refreshMeta]);
			if (loadError !== null) {
				const msg = loadError !== null && typeof loadError.message === "string" ? `（${loadError.message}）` : "";
				return h("section", { className: "dv_section" },
					h("p", { className: "dv_message", "data-error": "true" }, t("loadError") + msg));
			}
			const busy = active;
			const engineOk = state?.engineSupported ?? true;
			const onInstall = (version) => {
				if (confirmTarget !== version) {
					setConfirmTarget(version);
					return;
				}
				setConfirmTarget(null);
				setActionError(null);
				setNotice(t("upgradeStarted"));
				call("/dsh-versions/upgrade", { target: version }).then(
					() => setUpStatus({ status: "starting", message: t("upgradeStarted") }),
					(e) => {
						setNotice(null);
						setActionError(e);
						setUpStatus({ status: "idle" });
					},
				);
			};
			const onRestore = (version) => {
				const key = "history:" + version;
				if (confirmTarget !== key) {
					setConfirmTarget(key);
					return;
				}
				setConfirmTarget(null);
				setActionError(null);
				setNotice(t("upgradeStarted"));
				call("/dsh-versions/upgrade", { target: version }).then(
					() => setUpStatus({ status: "starting", message: t("upgradeStarted") }),
					(e) => {
						setNotice(null);
						setActionError(e);
						setUpStatus({ status: "idle" });
					},
				);
			};
			const onRelaunch = () => {
				setActionError(null);
				call("/dsh-versions/relaunch", {}).then(
					() => setNotice(t("relaunchStarted")),
					(e) => setActionError(e),
				);
			};
			const current = state?.framework?.version ?? null;
			const isFrameworkScoped = (name) => name.startsWith("@deepseek-ai/");
			return h("section", { className: "dv_section" },
				h("div", { className: "dv_head" },
					h("h3", null, t("title")),
					h("button", { className: "dv_btn dv_btnSmall", onClick: onRelaunch, disabled: busy || !engineOk }, t("relaunch"))),
				!engineOk ? h("p", { className: "dv_message", "data-error": "true" }, t("platformBlocked")) : null,
				DshCard({ t, state, releases }),
				upStatus !== null && upStatus.status !== "idle" && upStatus.status !== undefined
					? h("div", { className: "dv_banner", "data-active": active ? "true" : "false", "data-state": upStatus.status },
						active ? h("span", { className: "dv_spinner" }) : null,
						h("span", { className: "dv_bannerText" }, (upStatus.message ?? upStatus.status)))
					: null,
				notice !== null ? h("p", { className: "dv_message" }, notice) : null,
				actionError !== null
					? h("p", { className: "dv_message", "data-error": "true" }, typeof actionError.message === "string" ? actionError.message : String(actionError))
					: null,
				releasesError !== null
					? h("p", { className: "dv_message", "data-error": "true" }, t("releasesError") + (typeof releasesError.message === "string" ? `（${releasesError.message}）` : ""))
					: null,
				h("h3", null, t("releases")),
				h(ReleasesTable, { t, releases, current, busy: busy || !engineOk, onInstall, confirmTarget }),
				h(HistorySection, { t, history, busy: busy || !engineOk, onRestore, confirmTarget }),
				h(PluginsSection, { t, state, isFrameworkScoped }));
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
