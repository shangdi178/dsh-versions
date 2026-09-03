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
			nav: "版本管理",
			tab: "版本管理",
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
			compatConfirm: "⚠ 跨次版本安装：{from} → {to} 可能包含破坏性变更，已安装的第三方插件（Web UI 套件、市场等）可能暂时无法加载。再次点击确认以继续。",
			installedMarker: "当前",
			upgrading: "升级中",
			bannerIdle: "",
			history: "升级历史",
			historyEmpty: "还没有升级记录。",
			historyResult: { success: "成功", "rolled-back": "已回滚", failed: "失败" },
			restore: "恢复",
			upgradeStarted: "升级脚本已启动，进度如下（完成前后会自动重启服务）。",
			upgradeFailed409: "已有升级任务在运行。",
			snapshots: "快照与回滚",
			snapshotsIntro: "每次升级前会自动为当前版本做本地快照，可随时秒级回滚（免 npm、免网络）。",
			snapshotsEmpty: "还没有快照。升级过一次后这里会出现可回滚的历史版本。",
			snapshotsLoading: "正在读取快照…",
			snapshotsError: "暂时无法读取快照。",
			colSnapshot: "版本",
			colSnapshotAt: "快照时间",
			colSnapshotState: "状态",
			snapshotUsable: "可用",
			snapshotBroken: "已损坏",
			snapshotRestore: "回滚到此版本",
			snapshotRestoring: "恢复中…",
			snapshotConfirm: "确认回滚？",
			restoreStarted: "已从快照恢复，正在重启服务使新版本生效…",
			restoreResultOk: "已从快照恢复",
			shims: "兼容性垫片",
			shimsIntro: "垫片会把被新版 dsh 删除的旧 API 移植回框架文件，让按旧 API 构建的第三方插件继续加载。框架级修补：升级覆盖框架文件后会自动重新应用，可随时停用还原。仅在你明确需要时启用。",
			shimsLoading: "正在读取垫片状态…",
			shimsEmpty: "当前没有可用垫片。",
			shimEnable: "启用",
			shimDisable: "停用并还原",
			shimConfirm: "确认？",
			shimWorking: "处理中…",
			shimApplied: "垫片已应用（升级后也会自动重新应用）。",
			shimRemoved: "垫片已停用并还原框架文件。",
			shimActive: "已生效",
			shimStandby: "待命（当前版本不需要）",
			shimNotApplicable: "当前版本不适用",
		};
		const en = {
			nav: "Versions",
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
			compatConfirm: "⚠ Cross-minor install: {from} → {to} may contain breaking changes; installed third-party plugins (Web UI suites, market, etc.) may fail to load. Click confirm again to proceed.",
			installedMarker: "current",
			upgrading: "Upgrading",
			bannerIdle: "",
			history: "Upgrade history",
			historyEmpty: "No upgrades yet.",
			historyResult: { success: "success", "rolled-back": "rolled back", failed: "failed" },
			restore: "Restore",
			upgradeStarted: "Upgrade script started; progress below (the service restarts automatically at the end).",
			upgradeFailed409: "An upgrade is already running.",
			snapshots: "Snapshots & rollback",
			snapshotsIntro: "Before every upgrade a local snapshot of the current version is taken, so any previous version can be restored in seconds (no npm, no network).",
			snapshotsEmpty: "No snapshots yet. One appears after the first upgrade.",
			snapshotsLoading: "Loading snapshots…",
			snapshotsError: "Failed to load snapshots.",
			colSnapshot: "Version",
			colSnapshotAt: "Snapshot time",
			colSnapshotState: "State",
			snapshotUsable: "usable",
			snapshotBroken: "broken",
			snapshotRestore: "Roll back to this version",
			snapshotRestoring: "Restoring…",
			snapshotConfirm: "Confirm rollback?",
			restoreStarted: "Restored from snapshot; restarting the service to activate…",
			restoreResultOk: "Restored from snapshot",
			shims: "Compatibility shims",
			shimsIntro: "Shims port APIs removed by newer dsh back into framework files, so third-party plugins built against the old API keep loading. These are framework-level patches: they re-apply automatically after upgrades and can be disabled/restored anytime. Enable only when needed.",
			shimsLoading: "Loading shim status…",
			shimsEmpty: "No shims available.",
			shimEnable: "Enable",
			shimDisable: "Disable & restore",
			shimConfirm: "Confirm?",
			shimWorking: "Working…",
			shimApplied: "Shim applied (it re-applies automatically after upgrades).",
			shimRemoved: "Shim disabled and framework files restored.",
			shimActive: "Active",
			shimStandby: "Standby (not needed on this version)",
			shimNotApplicable: "Not applicable",
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
		/** 跨次版本判断：major.minor 任一不同即视为破坏性风险（0.1.1-rc.2 → 0.1.2-alpha.4 = true）。 */
		const isCrossMinor = (a, b) => {
			const pa = String(a ?? "").split("-")[0].split(".");
			const pb = String(b ?? "").split("-")[0].split(".");
			return pa.length >= 2 && pb.length >= 2 && (pa[0] !== pb[0] || pa[1] !== pb[1]);
		};

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

		function SnapshotsSection({ t }) {
			const [snaps, setSnaps] = react.useState(null);
			const [snapsError, setSnapsError] = react.useState(null);
			const [confirmVersion, setConfirmVersion] = react.useState(null);
			const [restoring, setRestoring] = react.useState(false);
			const [result, setResult] = react.useState(null);
			const refresh = react.useCallback(() => {
				call("/dsh-versions/snapshots").then(
					(d) => { setSnaps(d); setSnapsError(null); },
					(e) => setSnapsError(e),
				);
			}, []);
			react.useEffect(() => { refresh(); }, [refresh]);
			const onRestore = (version) => {
				if (confirmVersion !== version) {
					setConfirmVersion(version);
					return;
				}
				setConfirmVersion(null);
				setRestoring(true);
				setResult(null);
				call("/dsh-versions/restore", { version }).then(
					(d) => { setResult(d?.relaunched === false ? d.message : t("restoreStarted")); setRestoring(false); },
					(e) => { setResult(null); setRestoring(false); setSnapsError(e); },
				);
			};
			const items = Array.isArray(snaps?.snapshots) ? snaps.snapshots : null;
			let body;
			if (snapsError !== null) {
				body = h("p", { className: "dv_message", "data-error": "true" }, typeof snapsError.message === "string" ? snapsError.message : String(snapsError));
			} else if (items === null) {
				body = h("p", { className: "dv_message" }, t("snapshotsLoading"));
			} else if (items.length === 0) {
				body = h("p", { className: "dv_message" }, t("snapshotsEmpty"));
			} else {
				body = h("table", { className: "dv_table" },
					h("thead", null,
						h("tr", null,
							h("th", null, t("colSnapshot")),
							h("th", null, t("colSnapshotAt")),
							h("th", null, t("colSnapshotState")),
							h("th", null, t("colAction")))),
					h("tbody", null, items.map((s) => {
						const isConfirm = confirmVersion === s.version;
						const label = restoring
							? t("snapshotRestoring")
							: (isConfirm ? t("snapshotConfirm") : t("snapshotRestore"));
						return h("tr", { key: s.version },
							h("td", { className: "dv_mono" }, s.version),
							h("td", { className: "dv_note" }, s.at !== undefined ? fmtDate(s.at) : "—"),
							h("td", null, s.usable ? chip("ok", t("snapshotUsable")) : chip("muted", t("snapshotBroken"))),
							h("td", null,
								h("button", {
									className: "dv_btn dv_btnSmall",
									"data-confirm": isConfirm ? "true" : null,
									disabled: restoring || !s.usable,
									onClick: () => onRestore(s.version),
								}, label)));
					})));
			}
			return h("details", { className: "dv_details" },
				h("summary", null, t("snapshots") + (items !== null && items.length > 0 ? `（${items.length}）` : "")),
				h("div", { className: "dv_detailsInner" },
					h("p", { className: "dv_note" }, t("snapshotsIntro")),
					result !== null ? h("p", { className: "dv_message" }, result) : null,
					body));
		}

		function ShimsSection({ t }) {
			const [shims, setShims] = react.useState(null);
			const [shimsError, setShimsError] = react.useState(null);
			const [confirmId, setConfirmId] = react.useState(null);
			const [working, setWorking] = react.useState(null);
			const [result, setResult] = react.useState(null);
			const refresh = react.useCallback(() => {
				call("/dsh-versions/shims").then(
					(d) => { setShims(d); setShimsError(null); },
					(e) => setShimsError(e),
				);
			}, []);
			react.useEffect(() => { refresh(); }, [refresh]);
			const onToggle = (shim) => {
				const key = shim.id + (shim.enabled ? ":disable" : ":enable");
				if (confirmId !== key) {
					setConfirmId(key);
					return;
				}
				setConfirmId(null);
				setWorking(shim.id);
				setResult(null);
				const verb = shim.enabled ? "remove" : "apply";
				call(`/dsh-versions/shims/${verb}`, { id: shim.id }).then(
					(d) => {
						setResult(d.standby === true ? d.message : (shim.enabled ? t("shimRemoved") : t("shimApplied")));
						setWorking(null);
						refresh();
					},
					(e) => { setResult(null); setWorking(null); setShimsError(e); },
				);
			};
			const items = Array.isArray(shims?.shims) ? shims.shims : null;
			let body;
			if (shimsError !== null) {
				body = h("p", { className: "dv_message", "data-error": "true" }, typeof shimsError.message === "string" ? shimsError.message : String(shimsError));
			} else if (items === null) {
				body = h("p", { className: "dv_message" }, t("shimsLoading"));
			} else if (items.length === 0) {
				body = h("p", { className: "dv_message" }, t("shimsEmpty"));
			} else {
				body = h("div", { className: "dv_detailsInner" },
					items.map((s) => {
						const isConfirm = confirmId === s.id + (s.enabled ? ":disable" : ":enable");
						const label = working === s.id
							? t("shimWorking")
							: (isConfirm ? t("shimConfirm") : (s.enabled ? t("shimDisable") : t("shimEnable")));
						const statusChip = s.applied
							? chip("ok", t("shimActive"))
							: (s.applicable ? chip("update", t("shimStandby")) : chip("muted", t("shimNotApplicable")));
						return h("div", { className: "dv_card", key: s.id },
							h("div", { className: "dv_row" },
								h("strong", { className: "dv_name" }, s.name),
								statusChip,
								h("button", {
									className: "dv_btn dv_btnSmall",
									"data-confirm": isConfirm ? "true" : null,
									disabled: working !== null,
									onClick: () => onToggle(s),
								}, label)),
							h("p", { className: "dv_note" }, s.description));
					}));
			}
			return h("details", { className: "dv_details" },
				h("summary", null, t("shims") + (items !== null && items.length > 0 ? `（${items.length}）` : "")),
				h("div", { className: "dv_detailsInner" },
					h("p", { className: "dv_note" }, t("shimsIntro")),
					result !== null ? h("p", { className: "dv_message" }, result) : null,
					body));
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
			// 二次确认若为跨次版本安装/回滚，给出醒目兼容性警告（对齐 alpha.4 事故教训）
			const pendingVersion = typeof confirmTarget === "string"
				? (confirmTarget.startsWith("history:") ? confirmTarget.slice("history:".length) : confirmTarget)
				: null;
			const compatWarn = pendingVersion !== null && current !== null && isCrossMinor(current, pendingVersion)
				? t("compatConfirm").replace("{from}", current).replace("{to}", pendingVersion)
				: null;
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
				compatWarn !== null ? h("p", { className: "dv_message", "data-error": "true" }, compatWarn) : null,
				actionError !== null
					? h("p", { className: "dv_message", "data-error": "true" }, typeof actionError.message === "string" ? actionError.message : String(actionError))
					: null,
				releasesError !== null
					? h("p", { className: "dv_message", "data-error": "true" }, t("releasesError") + (typeof releasesError.message === "string" ? `（${releasesError.message}）` : ""))
					: null,
				h("h3", null, t("releases")),
				h(ReleasesTable, { t, releases, current, busy: busy || !engineOk, onInstall, confirmTarget }),
				h(HistorySection, { t, history, busy: busy || !engineOk, onRestore, confirmTarget }),
				h(SnapshotsSection, { t }),
				h(ShimsSection, { t }));
		}

		const inject = ["slots", "locale"];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-versions: dictionaries");
			const t = ctx.locale.bind(NS);
			// 独立设置分区（与 General / Plugins / Models 同级），不内嵌在「插件」区内，
			// 使 dsh 主程序版本管理不再是“插件分区里的一个子标签”，避免职责重叠。
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "versions",
				order: 20,
				label: () => t("nav"),
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
