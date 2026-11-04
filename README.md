<div align="center">

<h1>UbunMoni</h1>

![authors](https://img.shields.io/badge/authors-Aloudname-162b3e?style=flat-square)
![status](https://img.shields.io/badge/status-Beta-eebb00?style=flat-square)
![license](https://img.shields.io/badge/license-Apache--2.0-bbcc33?style=flat-square)
![TypesSript](https://img.shields.io/badge/ts-5.8.3-blue?logo=typescript&logoColor=white)

</div>

---

自用的 Ubuntu 资源监控扩展，改自 [Monitor Ultra](https://github.com/flycalm/vscode-monitor-ultra.git)。

## 指标

- **CPU**：线程数、瞬时使用率
- **内存**：占用条
- **存储**：文件吞吐、磁盘占用
- **GPU**：占用率、显存、温度。需要 `nvidia-smi`

不支持的指标显示 `N/A`。

## 构建与打包

```bash
npm install
npm run lint
npm run package   # webpack production build -> dist/extension.js
```

打包 VSIX（最新 `@vscode/vsce` 需 Node 20+），得到 `ubunmoni-1.1.0.vsix`：

```bash
npx @vscode/vsce package --no-dependencies --allow-missing-repository
```

如果只需要重新编译扩展代码，`npm run package` 即可。

## 安装

得到 `ubunmoni-1.1.0.vsix` 后，需在 **Remote SSH 终端**中执行：

```bash
code --install-extension </path/to/ubunmoni-1.1.0.vsix> --force
```

也可以在扩展视图右上角 `...` -> `Install from VSIX...` 中选择文件。

## 使用

- 打开 VS Code 底部面板中的 `System Monitor` 标签。
- 或运行命令面板中的 `System Monitor: Open Panel`。
- 设置项 `ubunmoni.refreshInterval`：刷新间隔（ms）。

## 说明

- **仅自用**。
- GPU 数据依赖 `nvidia-smi`；无 NVIDIA GPU 或不可用时显示 `N/A`。
