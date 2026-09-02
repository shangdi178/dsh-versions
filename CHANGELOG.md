# Changelog

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
