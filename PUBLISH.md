# 发布清单（dsh-versions → npm / GitHub）

> ✅ **v0.2.1 已于 2026-09-02 发布完成**（GitHub main + 标签 + Release，npm）。
>
> ✅ **v0.3.0 / v0.4.0 已于 2026-09-02 发布完成**：
> - 0.3.0：UI 提升为设置面板同级分区（`settings.section`），移除其它插件 npm 更新检查（`/updates` + 界面块）。
> - 0.4.0：快照秒级回滚（升级前自动本地快照 + `/snapshots` + `/restore`，任意历史版本可回滚）。
> 下方步骤保留，供后续 0.5.0 等版本参考。

代码已就绪（`v0.2.1` 标签已打，发布面已验证）。

## 0. 发布面已确认

`npm pack --dry-run` 已通过，产物含且仅含：

```
LICENSE  README.md  cordis.patch.yml  dsh.plugin.json
lib/client.js  lib/compare.js  lib/index.js  package.json
```

无 test/ 泄漏、无 .git、无多余产物。若你改动过 `files` 白名单或新增文件，先重跑：

```sh
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" pack --dry-run --cache "%TEMP%\dshv-npm-cache"
```

## 1. npm 发布（✅ v0.2.1 已发布）

> 2026-09-02 记录：账号 `shangdi178` 已含 `_authToken`（`npm whoami` → shangdi178），
> 但发布需 2FA。聊天内传 OTP 因 30 秒有效期 + 往返延迟不可靠（两次 EOTP），最终由本机终端
> 直接 `npm publish --access public` 完成（本人输入 OTP）。已通过 `npm view dsh-versions version`
> → `0.2.1`、dist-tags `latest: 0.2.1` 及下载 tarball 校验（shasum 一致、8 文件）。

发布前确认登录（`npm whoami` 报 ENEEDAUTH 时先 login）：

```sh
cd C:\Users\Hepu\dsh-plugins\dsh-versions

npm login          # 一次性；填 npm 账号/token
npm publish        # 发布 dsh-versions@0.2.1 到 latest 渠道
```

发布后自查：

```sh
npm view dsh-versions version            # 应输出 0.2.1
npm view dsh-versions files              # 应含 8 个发布文件
```

## 2. GitHub 仓库（✅ v0.2.1 已推送 + Release）

> 2026-09-02 记录：`origin` 已指向 `github.com/shangdi178/dsh-versions.git`（https 形式），
> `main` 与 `v0.2.1` 标签均已推送，Release 已建：
> `https://github.com/shangdi178/dsh-versions/releases/tag/v0.2.1`。

推送步骤（若换了远程地址沿用）：

```sh
cd C:\Users\Hepu\dsh-plugins\dsh-versions
git remote add origin git@github.com:shangdi178/dsh-versions.git   # 或 https 形式
git push -u origin main
git push origin v0.2.1        # 推送标签，便于 GitHub Release
```

在 GitHub 上按 `v0.2.1` 建一个 Release（标题/内容可引用 CHANGELOG 0.2.1 段）。

## 3. 发布后真机验证（可选但推荐）

用一个**临时 profile** 验证三种安装方式都不污染正式 web profile：

```sh
# 方式一（npm 发布后）
dsh plugin --profile sandbox add dsh-versions

# 方式二（GitHub 推送后）
git clone https://github.com/shangdi178/dsh-versions /tmp/dsv
dsh plugin --profile sandbox add ./dsv

# 方式三（离线 tarball）
npm pack
dsh plugin --profile sandbox add ./dsh-versions-0.2.1.tgz
```

每种装完确认（`--profile` 必须跟在 `plugin` 之后，bin.js 会拒绝父级 `--profile`）：

```sh
dsh plugin --profile sandbox why dsh-versions          # 应出现在依赖树里
# 查看 sandbox 的 package.json：dependencies 应含 "dsh-versions": "..."
type C:\Users\Hepu\.dsh\profiles\sandbox\package.json
```

> 注：/dsh-versions HTTP 路由只在 **web** 类 profile（挂了 webServer）里挂载；
> 裸 sandbox profile 不启 HTTP。若要验证路由，把 sandbox 按 web profile 方式启动后再访问
> `http://127.0.0.1:<port>/dsh-versions/state`，应返回
> `{ ok:true, platform, engineSupported, framework }`。

验证完删除临时 profile：`rmdir /s /q C:\Users\Hepu\.dsh\profiles\sandbox`。

## 4. 正式 web profile 激活 0.2.1

当前运行中的 web 服务加载的是旧版内存代码；按你的习惯重启即可：

```sh
powershell -ExecutionPolicy Bypass -File C:\Users\Hepu\.dsh\restart-web.ps1
```

重启后到 **设置 → 插件 → 版本**，应看到 0.2.1；升级历史里那条残留的「拉起失败」应已自动清除。
