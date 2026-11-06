<div align="center">

<h1>UbunMoni</h1>

![modifier](https://img.shields.io/badge/modifier-Aloudname-162b3e?style=flat-square)
![status](https://img.shields.io/badge/status-Beta-eebb00?style=flat-square)
![license](https://img.shields.io/badge/license-Apache--2.0-bbcc33?style=flat-square)
![TypeScript](https://img.shields.io/badge/ts-5.8.3-blue?logo=typescript&logoColor=white)

</div>

---

轻量的 Ubuntu 资源监控扩展，改自 [Monitor Ultra](https://github.com/flycalm/vscode-monitor-ultra.git)。

## 指标

- **CPU**：线程数、瞬时使用率
- **内存**：占用条
- **存储**：文件吞吐、磁盘占用
- **GPU**：占用率、显存、温度

不支持的指标显示 `N/A`。

## 下载和安装

注意！本拓展是工作区专属，因此下载后需上传并安装至服务器，扩展才会运行在服务器端，读取服务器指标。

从 [release 页面](https://github.com/Aloudname/UbunMoni/releases) 获取发布包 `ubunmoni-<version>.vsix` 并传至服务器。需 VS Code `1.101.2` 或更高版本。

两种安装方式。推荐在远程窗口的扩展视图右上角 `...` → `Install from VSIX...` 选择 `ubunmoni-<version>.vsix`。也可直接在远程终端执行：

```bash
code --install-extension /path/on/server/ubunmoni-<version>.vsix --force
```

记得改成 **实际路径和版本**。无论何种方式，安装后要重载窗口。

## 使用

- 打开 VS Code 底部面板中的 `System Monitor` 标签，或在命令面板中运行 `> System Monitor: Open Panel`。
- 如果视图被移动到侧边栏，可在命令面板中运行 `> View: Reset View Locations` 恢复默认位置。
- 设置项 `ubunmoni.refreshInterval`：刷新间隔（ms）。

## 构建与打包

若需进一步定制功能，改动代码（**并测试！**）后运行：

```bash
npm install
npm run lint
npm run package   # webpack production build -> dist/extension.js
```

打包 VSIX（固定使用 `@vscode/vsce@3.9.2`，需要 **Node 20+**。项目已提供 `.nvmrc`，若默认 Node 不是 20，先切换：

```bash
nvm install 20
nvm use
node --version   # >>> v20.x
```

然后打包，得到 `ubunmoni-<version>.vsix`：

```bash
npx @vscode/vsce@3.9.2 package --no-dependencies --allow-missing-repository
```

如果只需要重新编译扩展代码，`npm run package` 即可。

## 说明

- **个人使用**，未发布到 VS Code Marketplace。
- GPU 数据依赖 `nvidia-smi`。
