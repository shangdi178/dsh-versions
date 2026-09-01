# dsh-versions

最简 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）版本管理插件：
在 dsh web 的 **设置 → 插件 → 「版本」子标签** 里，查看 dsh 主程序与全部已安装插件的版本，
一键检查 npm 上有没有更新。

**纯只读**——只看版本、只查更新，不安装、不升级、不改任何配置。
要一键升级框架/插件，请配合 [dsh-plugin-console](https://github.com/Noob-stupid/dsh-plugin-hub) 使用。

```
设置 → 插件 → 「版本」子标签

┌──────────────────────────────────────────────┐
│ 版本总览                    [检查更新]        │
│ 检查于 2026/9/1 12:00:00                     │
│ ┌──────────────────────────────────────────┐ │
│ │ dsh 主程序            0.1.1-rc.2  已是最新│ │
│ └──────────────────────────────────────────┘ │
│ 已安装插件                                    │
│ 组件          已装版本   最新版本   状态       │
│ dshmarket     1.33.0    1.39.0    可更新     │
│ dsh-vision    0.1.0     —         npm上不存在│
│ …             …         …         已是最新   │
└──────────────────────────────────────────────┘
```

## 功能

- **版本总览**：dsh 主程序版本 + 当前 profile 全部已安装插件的版本（读自各包 package.json）
- **一键检查更新**：并发查询 npm registry 的 `latest` 标签，标出所有可更新组件（10 分钟缓存）
- **诚实标注**：npm 上不存在的包（本地 link 包等）标「npm 上不存在」，不误报；
  官方框架组件（`@deepseek-ai/*`）标「随框架升级」——它们与主程序配套发布，单独升级会版本混搭

## 安装

```sh
# npm 包（推荐）
dsh plugin --profile web add dsh-versions

# 或从源码目录
git clone https://github.com/shangdi178/dsh-versions
dsh plugin --profile web add ./dsh-versions
```

装完重启 dsh web，进 **设置 → 插件 → 版本**。

## HTTP 接口（环回，仅限本机访问）

| 路由 | 说明 |
| --- | --- |
| `GET /dsh-versions/state` | 框架版本 + 全部已装插件清单（name/version/repository） |
| `GET /dsh-versions/updates` | 并发查 npm `latest`，返回 `{name, installed, latest, updateAvailable}` |

## 开发

零依赖、零构建：`lib/` 即产物，直接可跑。

```sh
npm test        # 版本比较单测（node:test）
```

- 服务端（`lib/index.js`）：cordis 插件，`inject: ['webServer', 'loader']`，
  经 `ctx.webServer.register` 挂载环回路由，安全护栏（环回 + Host 校验）与 dsh-plugin-console 同款
- 客户端（`lib/client.js`）：`__ModuleLoader__` 包装，`ctx.slots.inject("settings.plugins.tab", …)`
  在官方"插件"设置页注册子标签，中英双语词典经 `ctx.locale.register` 注册

## License

[MIT](./LICENSE)
