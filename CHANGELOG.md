# Changelog

## 0.4.0 (2026-09-02)

- **快照秒级回滚（全新）**：每次升级前自动为当前版本做**本地快照**（`~/.dsh/dsh-versions/snapshots/<版本>/`），
  回滚 = 本地复制（免 npm、免网络、通常数秒），可回滚到任意历史版本，不再只依赖「上一版本」的 robocopy 备份。
  - 快照目录带 `meta.json` 校验，残缺/损坏快照绝不覆盖可用安装；创建走「临时目录 + rename」避免崩溃残留。
  - 回滚先「改名旧目录让开」再复制，失败自动还原原目录，保持机器继续运行原有代码。
  - 按配置数量自动修剪（默认保留 5 个）；损坏快照优先清除。
- **回滚与升级互斥**：升级进行中禁止恢复（409）。
- **新接口**：`GET /dsh-versions/snapshots`（快照清单 + 忙态）、`POST /dsh-versions/restore`（从快照恢复；引擎平台自动重启，其余平台提示手动重启）。
- **UI**：设置面板「版本管理」新增「快照与回滚」卡片（列表 + 二次确认回滚）。
- 借鉴说明：机制思路参考 SuCriss/dsh-version-update（Apache-2.0），**代码为本项目原创 MIT 实现**；详见 `STUDY.md`。
- 测试：新增 `test/snapshot.test.js`（7 用例），共 19 用例全绿。

## 0.3.0 (unreleased)

- **架构调整：独立设置分区**：UI 从「插件」设置分区内的子标签（`settings.plugins.tab`）
  提升为与 General / Plugins / Models **同级的独立设置分区**（`settings.section`，
  导航名「版本管理」）。dsh 主程序版本管理不再嵌套在插件页里，职责更清晰。
- **去重：移除其它插件的 npm 更新检查**：删除 `/dsh-versions/updates` 端点及
  「其他插件版本速览 / 检查插件更新」界面块——它只读提示可更新却无法操作其它插件，
  与 dsh 版本管理定位重叠。`/state` 精简为框架版本 + 平台/引擎支持状态。
  其它插件的安装/更新仍由 `dsh plugin` 负责，本插件只专注 dsh 主程序版本。
- 重构服务端：移除已装插件清单（`listPackages`/`pkgMeta`）相关死代码。

## 0.2.1 (2026-09-02)

- **平台防护**：升级/重启引擎仅 Windows 可用（依赖 robocopy / schtasks / Windows PowerShell 5.1）；
  非 Windows 时 `/state` 返回 `engineSupported: false`，UI 禁用升级/重装/恢复/重启按钮并提示，
  服务端 `/upgrade`、`/relaunch` 拒绝并返回 501；版本查看与更新检查在所有平台可用。
- **修复**：插件启动时清除上次运行残留的 terminal `failed` 状态（此前 `failed` 被标记为终态
  永不过期，UI 会一直显示旧「拉起失败」提示）。
- **文档**：README 安装节改为三种真实可用的方式（npm 发布 / git clone / 离线 tarball），
  标注平台限制。

## 0.2.0 (2026-09-01)

- 升级引擎三处致命 bug 修复：
  - `$cmdLines` 用括号包裹 registry 拼接（PS 数组字面量 + 拼接被拆行 → cmd 退出码 9009）
  - 端口工具加 `netstat` 回退 + HTTP 就绪探测（`Get-NetTCPConnection` 看不到高完整性监听者 → 假拉起失败）
  - 重启脚本 `Start-Process` 补 `-WorkingDirectory` 与标准输出/错误重定向
- 升级/重启脚本生成器以 `__builders` 导出，新增脚本回归测试（registry 同行、端口工具、重定向）。

## 0.1.0 (2026-08-30)

- 最简 dsh 版本管理：dsh 主程序 + 全部已装插件版本总览、一键 npm 更新检查、
  dsh 全部已发布版本列表（dist-tags 渠道）、在线升级/降级/重装（备份 + 失败自动回滚）、
  升级历史、手动重启服务。
