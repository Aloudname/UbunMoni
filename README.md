<div align="center">

<h1>UbunMoni</h1>

![authors](https://img.shields.io/badge/authors-Aloudname-162b3e?style=flat-square)
![status](https://img.shields.io/badge/status-Beta-eebb00?style=flat-square)
![license](https://img.shields.io/badge/license-Apache--2.0-bbcc33?style=flat-square)
![TypesSript](https://img.shields.io/badge/ts-5.8.3-blue?logo=typescript&logoColor=white)

</div>

---

轻量的 Ubuntu 资源监控扩展，改自 [Monitor Ultra](https://github.com/flycalm/vscode-monitor-ultra.git)。

## 指标

- **CPU**：线程数、瞬时使用率
- **内存**：占用条
- **存储**：文件吞吐、磁盘占用
- **GPU**：占用率、显存、温度

不支持的指标显示 `N/A`。

## 构建与打包

```bash
npm install
npm run lint
npm run package   # webpack production build -> dist/extension.js
```

打包 VSIX（最新 `@vscode/vsce` 需 Node 20+），得到 `ubunmoni-<version>.vsix`：

```bash
npx @vscode/vsce package --no-dependencies --allow-missing-repository
```

如果只需要重新编译扩展代码，`npm run package` 即可。

## 安装

必须在 **Remote SSH 窗口**中安装，扩展才会运行在服务器端、读取服务器指标。需要 VS Code `1.101.2` 或更高版本。

推荐在远程窗口的扩展视图右上角 `...` → `Install from VSIX...` 选择 `ubunmoni-<version>.vsix`。也可以先把 VSIX 传到服务器，再在远程终端执行：

```bash
code --install-extension /path/on/server/ubunmoni-<version>.vsix --force
```

记得改成 **实际路径和版本**，且安装后要重载窗口。

## 使用

- 打开 VS Code 底部面板中的 `System Monitor` 标签。
- 或运行命令面板中的 `System Monitor: Open Panel`。
- 如果视图被移动到侧边栏，运行命令面板中的 `View: Reset View Locations` 恢复默认位置。
- 设置项 `ubunmoni.refreshInterval`：刷新间隔（ms）。

## 说明

- **内部使用**，不发布到 VS Code Marketplace。
- GPU 数据依赖 `nvidia-smi`。
