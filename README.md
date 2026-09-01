# dsh-versions

DeepSeek Harness（dsh）版本管理插件：在 dsh web 的 **设置 → 插件 → 「版本」子标签** 里，
查看 dsh 主程序与全部已安装插件的版本，一键检查 npm 更新，并支持**在线升级 dsh 主程序**
（升级/降级/重装、备份回滚、升级历史、手动重启服务）。

**只操作 dsh 主程序本身**：升级引擎走 `npm install -g @deepseek-ai/dsh@<版本>`，
备份回滚点完整复制框架目录，失败自动恢复；纯本地、仅限本机访问，不碰其他插件的安装。

```
设置 → 插件 → 「版本」子标签

┌──────────────────────────────────────────────────┐
│ dsh 版本管理                        [重启服务]     │
│ dsh 主程序                        0.1.1-rc.2      │
│ 渠道  latest 0.1.1-rc.2 ✓   next —   alpha —      │
│ npm 版本列表                                      │
│ 版本          发布时间              渠道   操作     │
│ 0.1.1-rc.2    2026-08-30 …    latest [重装]      │
│ 0.1.2-alpha.3 2026-08-29 …           [安装]      │
│ …                                                 │
│ 升级历史（2）  0.1.1-rc.2 → 0.1.2-alpha.3 失败 …  │
│ 其他插件速览 …                                    │
└──────────────────────────────────────────────────┘
```

## 功能

- **版本总览**：dsh 主程序版本 + 当前 profile 全部已安装插件的版本（读自各包 package.json）
- **一键检查更新**：并发查询 npm registry 的 `latest` 标签，标出可更新组件（10 分钟缓存）
- **npm 版本列表**：dsh 全部已发布版本 + 渠道（`latest` / `next` / `alpha` 对应的 dist-tags），
  可对任意已发布版本发起**安装 / 重装**（升级、降级均可）
- **升级引擎**：备份框架目录 → `npm install -g`（npmjs → npmmirror 双源，仍失败停服重试一轮）
  → 以磁盘 package.json 版本为准校验 → 失败 `robocopy` 恢复备份 → 停服拉起新版本生效
- **升级历史**：本地 `history.jsonl` 记录每次升级的 from/to/结果，可一键恢复到历史版本
- **手动重启**：重启 dsh web 服务（schtasks 脱离服务进程树执行，日志写入 `~/.dsh/dsh-versions/`）
- **诚实标注**：npm 上不存在的包（本地 link 包等）标「npm 上不存在」；
  官方框架组件（`@deepseek-ai/*`）标「随框架升级」——它们与主程序配套发布

## 安装

需要 dsh ≥ 0.1.0（`dsh plugin` 命令自 0.1.x 提供）。三种方式任选其一：

```sh
# 方式一：npm 包（发布后，推荐）
dsh plugin --profile web add dsh-versions

# 方式二：从源码目录（未发布 / 自编译时）
git clone https://github.com/shangdi178/dsh-versions
dsh plugin --profile web add ./dsh-versions

# 方式三：离线 tarball
npm pack                       # 在 dsh-versions 仓库根目录执行
dsh plugin --profile web add ./dsh-versions-0.2.0.tgz
```

装完重启 dsh web，进 **设置 → 插件 → 版本**。

> **平台限制**：**版本查看 / 更新检查在所有平台可用**；但**升级 / 重装 / 恢复 / 手动重启**引擎
> 依赖 Windows 工具（`robocopy` / `schtasks` / Windows PowerShell 5.1），仅在 Windows 上提供——
> 其他平台对应按钮会禁用并提示原因（服务端同样拒绝并返回 501）。
> 非 Windows 用户如需升级 dsh，请手动执行 `npm install -g @deepseek-ai/dsh@<版本>`。

## HTTP 接口（环回，仅限本机访问）

| 路由 | 说明 |
| --- | --- |
| `GET  /dsh-versions/state` | 框架版本 + 全部已装插件清单（name/version/repository） |
| `GET  /dsh-versions/updates` | 并发查 npm `latest`，返回 `{name, installed, latest, updateAvailable}` |
| `GET  /dsh-versions/releases` | dsh 全部已发布版本 + 渠道（dist-tags + 发布时间） |
| `GET  /dsh-versions/upgrade-status` | 当前升级任务状态（文件态，可断连恢复） |
| `GET  /dsh-versions/history` | 本地升级历史 |
| `POST /dsh-versions/upgrade` | 安装指定版本（升级/降级/重装，备份 + 失败自动回滚），body `{target}` |
| `POST /dsh-versions/relaunch` | 手动重启 dsh web 服务 |

写接口带跨站防护：环回地址 + Host 白名单 + Origin / Sec-Fetch-Site 校验。

## 开发

零依赖、零构建：`lib/` 即产物，直接可跑。

```sh
npm test        # 版本比较 + 升级/重启脚本生成回归（node:test）
```

- 服务端（`lib/index.js`）：cordis 插件，`inject: ['webServer', 'loader']`，
  经 `ctx.webServer.register` 挂载环回路由；升级/重启脚本生成器
  `buildUpgradeScript` / `buildRelaunchScript` 以 `__builders` 导出供单测断言
  （已覆盖 PS 数组字面量拼接拆行、监听进程可见性、输出重定向等历史回归）
- 客户端（`lib/client.js`）：`__ModuleLoader__` 包装，`ctx.slots.inject("settings.plugins.tab", …)`
  在官方「插件」设置页注册子标签，中英双语词典经 `ctx.locale.register` 注册
- 升级引擎产物：`~/.dsh/dsh-versions/`（状态、日志、备份、历史）

## License

[MIT](./LICENSE)
