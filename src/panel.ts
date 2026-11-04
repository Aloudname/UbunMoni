import * as vscode from "vscode";
import {
	CONFIG_SECTION,
	VIEW_ID,
	getRefreshInterval,
} from "./configuration";
import { MonitorSampler, Snapshot } from "./sampler";

interface PanelSnapshot extends Snapshot {
	refreshInterval: number;
}

interface PanelMessage {
	type?: string;
}

export class MonitorPanelProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = VIEW_ID;

	private view: vscode.WebviewView | undefined;
	private timer: NodeJS.Timeout | undefined;
	private readonly sampler = new MonitorSampler();

	constructor(private readonly extensionUri: vscode.Uri) {}

	resolveWebviewView(view: vscode.WebviewView): void {
		this.view = view;
		view.webview.options = {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")],
		};
		view.webview.html = this.html(view.webview);

		const messageSubscription = view.webview.onDidReceiveMessage(
			(message: PanelMessage) => {
				if (message.type === "ready") {
					void this.tick();
					return;
				}
				if (message.type === "openSettings") {
					void vscode.commands.executeCommand(
						"workbench.action.openSettings",
						CONFIG_SECTION
					);
				}
			}
		);

		view.onDidChangeVisibility(() => {
			if (view.visible) {
				this.send({ type: "reset" });
				this.start();
			} else {
				this.stop();
			}
		});

		view.onDidDispose(() => {
			messageSubscription.dispose();
			this.stop();
			this.view = undefined;
		});

		if (view.visible) {
			this.start();
		}
	}

	refreshRateChanged(): void {
		this.postConfig();
		if (this.view?.visible) {
			this.stop();
			this.start();
		}
	}

	dispose(): void {
		this.stop();
		this.view = undefined;
	}

	private start(): void {
		if (this.timer) {
			return;
		}
		void this.tick();
		this.timer = setInterval(() => void this.tick(), getRefreshInterval());
	}

	private stop(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}

	private async tick(): Promise<void> {
		if (!this.view?.visible) {
			return;
		}
		const snapshot = await this.sampler.sample();
		if (!snapshot || !this.view?.visible) {
			return;
		}
		const message: PanelSnapshot = {
			...snapshot,
			refreshInterval: getRefreshInterval(),
		};
		this.send({ type: "snapshot", data: message });
	}

	private send(message: unknown): void {
		const view = this.view;
		if (!view) {
			return;
		}
		void view.webview.postMessage(message).then(undefined, () => {});
	}

	private postConfig(): void {
		this.send({
			type: "config",
			refreshInterval: getRefreshInterval(),
		});
	}

	private html(webview: vscode.Webview): string {
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, "media", "panel.css")
		);
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, "media", "panel.js")
		);
		const csp = webview.cspSource;

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${csp}; script-src ${csp}; img-src ${csp} data:;">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<link rel="stylesheet" href="${styleUri}">
	<title>System Monitor</title>
</head>
<body>
	<header class="toolbar">
		<span class="wordmark">SYSTEM MONITOR</span>
		<span class="toolbar-spacer"></span>
		<span class="live"><span class="live-dot"></span>LIVE</span>
		<span id="interval" class="interval">1s</span>
		<button id="settings" class="icon-button" type="button" title="Open settings" aria-label="Open settings">
			<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
				<line x1="4" y1="7" x2="20" y2="7"></line><circle cx="9" cy="7" r="2"></circle>
				<line x1="4" y1="17" x2="20" y2="17"></line><circle cx="15" cy="17" r="2"></circle>
			</svg>
		</button>
	</header>

	<main class="grid">
		<section class="card cpu-card" aria-label="CPU">
			<div class="card-head">
				<span class="label">CPU</span>
				<span id="cpu-threads" class="aux">—</span>
			</div>
			<div class="hero"><span id="cpu-usage" class="value">—</span></div>
			<div class="spark cpu-spark">
				<svg id="cpu-chart" viewBox="0 0 300 44" preserveAspectRatio="none" aria-hidden="true">
					<path id="cpu-area" class="area cpu-area" d=""></path>
					<path id="cpu-line" class="line cpu-line" d=""></path>
				</svg>
			</div>
		</section>

		<section class="card memory-card" aria-label="Memory">
			<div class="card-head">
				<span class="label">MEMORY</span>
			</div>
			<div class="hero"><span id="mem-pair" class="value">—</span></div>
			<div class="metric-row">
				<span class="aux-label">ACTIVE</span>
				<span id="mem-active" class="secondary">—</span>
			</div>
			<div class="bar mem-bar" role="img" aria-label="Memory usage">
				<span id="mem-used-fill" class="fill mem-used"></span>
				<span id="mem-active-fill" class="fill mem-active"></span>
			</div>
		</section>

		<section class="card storage-card" aria-label="Storage and IO">
			<div class="card-head">
				<span class="label">STORAGE &amp; I/O</span>
			</div>
			<div class="io-row">
				<div class="io-stat read">
					<span class="io-arrow">↓</span>
					<span id="io-read" class="io-value">—</span>
					<span class="io-label">READ</span>
				</div>
				<div class="io-stat write">
					<span class="io-arrow">↑</span>
					<span id="io-write" class="io-value">—</span>
					<span class="io-label">WRITE</span>
				</div>
			</div>
			<div class="spark io-spark">
				<svg id="io-chart" viewBox="0 0 300 44" preserveAspectRatio="none" aria-hidden="true">
					<path id="io-read-line" class="line read-line" d=""></path>
					<path id="io-write-line" class="line write-line" d=""></path>
				</svg>
			</div>
			<div id="disks" class="disks"></div>
		</section>

		<section class="card gpu-card" aria-label="GPU">
			<div class="card-head">
				<span class="label">GPU</span>
				<span id="gpu-count" class="aux">—</span>
			</div>
			<div id="gpus" class="gpu-grid"></div>
		</section>
	</main>

	<script src="${scriptUri}"></script>
</body>
</html>`;
	}
}
