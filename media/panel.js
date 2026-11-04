(() => {
	"use strict";

	const vscode = acquireVsCodeApi();
	const HISTORY = 60;
	const BINARY_UNITS = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
	const RATE_UNITS = ["B/s", "KB/s", "MB/s", "GB/s", "TB/s"];
	const SVG_WIDTH = 300;
	const SVG_HEIGHT = 44;
	const SVG_PAD = 2;

	const state = {
		cpu: [],
		io: [],
		refreshInterval: 1000,
		gpuTiles: [],
		diskRows: [],
		gpusEmpty: null,
		disksEmpty: null,
	};

	const byId = (id) => document.getElementById(id);
	const el = {
		interval: byId("interval"),
		settings: byId("settings"),
		cpuUsage: byId("cpu-usage"),
		cpuThreads: byId("cpu-threads"),
		cpuLine: byId("cpu-line"),
		cpuArea: byId("cpu-area"),
		memPair: byId("mem-pair"),
		memActive: byId("mem-active"),
		memUsedFill: byId("mem-used-fill"),
		memActiveFill: byId("mem-active-fill"),
		ioRead: byId("io-read"),
		ioWrite: byId("io-write"),
		ioReadLine: byId("io-read-line"),
		ioWriteLine: byId("io-write-line"),
		disks: byId("disks"),
		gpus: byId("gpus"),
		gpuCount: byId("gpu-count"),
	};

	const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

	const finiteOrNull = (value) =>
		typeof value === "number" && Number.isFinite(value) ? value : null;

	const scale = (value, base, units) => {
		let scaled = Math.max(0, value);
		let index = 0;
		while (scaled >= base && index < units.length - 1) {
			scaled /= base;
			index += 1;
		}
		return { value: scaled, unit: units[index], index };
	};

	const digitsFor = (value) => (value >= 100 ? 0 : value >= 10 ? 1 : 2);

	const formatBytes = (bytes) => {
		if (!Number.isFinite(bytes) || bytes < 1) {
			return "0 B";
		}
		const { value, unit } = scale(bytes, 1024, BINARY_UNITS);
		return `${value.toFixed(digitsFor(value))} ${unit}`;
	};

	const formatPair = (used, total) => {
		if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) {
			return "N/A";
		}
		const { unit, index } = scale(total, 1024, BINARY_UNITS);
		const factor = Math.pow(1024, index);
		return `${(used / factor).toFixed(1)} / ${(total / factor).toFixed(1)} ${unit}`;
	};

	const formatGpuPair = (used, total) => {
		if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) {
			return "N/A";
		}
		const { unit, index } = scale(total, 1024, BINARY_UNITS);
		const factor = Math.pow(1024, index);
		const shortUnit = unit === "B" ? "B" : unit[0];
		return `${(used / factor).toFixed(1)}/${(total / factor).toFixed(0)}${shortUnit}`;
	};

	const formatRate = (bytesPerSecond) => {
		if (!Number.isFinite(bytesPerSecond)) {
			return "N/A";
		}
		if (bytesPerSecond < 1) {
			return "0 B/s";
		}
		const { value, unit } = scale(bytesPerSecond, 1000, RATE_UNITS);
		return `${value.toFixed(digitsFor(value))} ${unit}`;
	};

	const formatPercent = (value) =>
		Number.isFinite(value) ? `${value.toFixed(1)}%` : "N/A";

	const formatInterval = (milliseconds) => {
		if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
			return "1s";
		}
		if (milliseconds < 1000) {
			return `${Math.round(milliseconds)}ms`;
		}
		const seconds = milliseconds / 1000;
		return Number.isInteger(seconds) ? `${seconds}s` : `${seconds.toFixed(1)}s`;
	};

	const resetHistory = () => {
		state.cpu = [];
		state.io = [];
		el.cpuLine.setAttribute("d", "");
		el.cpuArea.setAttribute("d", "");
		el.ioReadLine.setAttribute("d", "");
		el.ioWriteLine.setAttribute("d", "");
	};

	const niceMax = (value) => {
		if (!Number.isFinite(value) || value <= 0) {
			return 1;
		}
		const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
		const normalized = value / magnitude;
		const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
		return step * magnitude;
	};

	const buildSpark = (values, max) => {
		const step = SVG_WIDTH / (HISTORY - 1);
		const offset = (HISTORY - values.length) * step;
		let line = "";
		let area = "";
		let segment = [];

		const flush = () => {
			if (segment.length === 0) {
				return;
			}
			if (segment.length === 1) {
				const point = segment[0];
				line += `M${(point.x - 0.6).toFixed(1)},${point.y.toFixed(1)}L${(point.x + 0.6).toFixed(1)},${point.y.toFixed(1)}`;
				area += `M${(point.x - 0.6).toFixed(1)},${SVG_HEIGHT}L${(point.x - 0.6).toFixed(1)},${point.y.toFixed(1)}L${(point.x + 0.6).toFixed(1)},${point.y.toFixed(1)}L${(point.x + 0.6).toFixed(1)},${SVG_HEIGHT}Z`;
			} else {
				line += `M${segment[0].x.toFixed(1)},${segment[0].y.toFixed(1)}`;
				area += `M${segment[0].x.toFixed(1)},${SVG_HEIGHT}L${segment[0].x.toFixed(1)},${segment[0].y.toFixed(1)}`;
				for (let index = 1; index < segment.length; index += 1) {
					const point = segment[index];
					line += `L${point.x.toFixed(1)},${point.y.toFixed(1)}`;
					area += `L${point.x.toFixed(1)},${point.y.toFixed(1)}`;
				}
				const last = segment[segment.length - 1];
				area += `L${last.x.toFixed(1)},${SVG_HEIGHT}Z`;
			}
			segment = [];
		};

		values.forEach((value, index) => {
			if (!Number.isFinite(value)) {
				flush();
				return;
			}
			const x = offset + index * step;
			const ratio = clamp(value / max, 0, 1);
			const y = SVG_HEIGHT - SVG_PAD - ratio * (SVG_HEIGHT - SVG_PAD * 2);
			segment.push({ x, y });
		});
		flush();
		return { line, area };
	};

	const renderCpu = (cpu) => {
		const usage = finiteOrNull(cpu.usage);
		state.cpu.push(usage);
		if (state.cpu.length > HISTORY) {
			state.cpu.shift();
		}
		el.cpuUsage.textContent = formatPercent(usage);
		el.cpuThreads.textContent = `${cpu.threads ?? 0} threads`;
		el.cpuThreads.title = cpu.model ?? "";
		const paths = buildSpark(state.cpu, 100);
		el.cpuLine.setAttribute("d", paths.line);
		el.cpuArea.setAttribute("d", paths.area);
	};

	const renderMemory = (memory) => {
		const used = finiteOrNull(memory.used);
		const active = finiteOrNull(memory.active);
		const total = finiteOrNull(memory.total);
		el.memPair.textContent = formatPair(used, total);
		el.memActive.textContent = active === null ? "N/A" : formatBytes(active);
		const usedPercent = used !== null && total ? clamp((used / total) * 100, 0, 100) : 0;
		const activePercent = active !== null && total ? clamp((active / total) * 100, 0, 100) : 0;
		el.memUsedFill.style.width = `${usedPercent}%`;
		el.memActiveFill.style.width = `${activePercent}%`;
	};

	const renderIo = (io) => {
		const read = finiteOrNull(io.read);
		const write = finiteOrNull(io.write);
		state.io.push({ read, write });
		if (state.io.length > HISTORY) {
			state.io.shift();
		}
		el.ioRead.textContent = formatRate(read);
		el.ioWrite.textContent = formatRate(write);

		const values = [];
		for (const point of state.io) {
			if (Number.isFinite(point.read)) {
				values.push(point.read);
			}
			if (Number.isFinite(point.write)) {
				values.push(point.write);
			}
		}
		const max = niceMax(Math.max(1, ...values) * 1.08);
		el.ioReadLine.setAttribute(
			"d",
			buildSpark(state.io.map((point) => point.read), max).line
		);
		el.ioWriteLine.setAttribute(
			"d",
			buildSpark(state.io.map((point) => point.write), max).line
		);
	};

	const createDiskRow = () => {
		const root = document.createElement("div");
		root.className = "disk";
		const top = document.createElement("div");
		top.className = "disk-top";
		const mount = document.createElement("span");
		mount.className = "disk-mount";
		const pair = document.createElement("span");
		pair.className = "disk-pair";
		const pct = document.createElement("span");
		pct.className = "disk-pct";
		top.append(mount, pair, pct);
		const bar = document.createElement("div");
		bar.className = "bar";
		const fill = document.createElement("span");
		fill.className = "fill";
		bar.append(fill);
		root.append(top, bar);
		return { root, mount, pair, pct, fill };
	};

	const ensureDiskRows = (disks) => {
		if (disks.length === 0) {
			if (state.disksEmpty) {
				return;
			}
			el.disks.replaceChildren();
			state.diskRows = [];
			const empty = document.createElement("div");
			empty.className = "empty";
			empty.textContent = "No disk data";
			el.disks.append(empty);
			state.disksEmpty = empty;
			return;
		}
		if (state.diskRows.length === disks.length) {
			return;
		}
		el.disks.replaceChildren();
		state.diskRows = [];
		state.disksEmpty = null;
		for (let index = 0; index < disks.length; index += 1) {
			const row = createDiskRow();
			el.disks.append(row.root);
			state.diskRows.push(row);
		}
	};

	const renderDisks = (disks) => {
		ensureDiskRows(disks);
		disks.forEach((disk, index) => {
			const row = state.diskRows[index];
			if (!row) {
				return;
			}
			const percent = clamp(Number.isFinite(disk.percent) ? disk.percent : 0, 0, 100);
			const pair = formatPair(disk.used, disk.size);
			row.mount.textContent = disk.mount;
			row.mount.title = disk.mount;
			row.pair.textContent = pair;
			row.pct.textContent = formatPercent(percent);
			row.fill.style.width = `${percent}%`;
			row.root.classList.toggle("warn", percent >= 85 && percent < 95);
			row.root.classList.toggle("crit", percent >= 95);
			row.root.title = `${disk.mount} · ${pair} · ${formatPercent(percent)} used`;
		});
	};

	const createGpuTile = () => {
		const root = document.createElement("div");
		root.className = "gpu";
		const top = document.createElement("div");
		top.className = "gpu-top";
		const name = document.createElement("span");
		name.className = "gpu-name";
		const temp = document.createElement("span");
		temp.className = "gpu-temp";
		top.append(name, temp);
		const utilGroup = document.createElement("div");
		utilGroup.className = "gpu-util-group";
		const utilRow = document.createElement("div");
		utilRow.className = "gpu-util-row";
		const util = document.createElement("span");
		util.className = "gpu-util";
		const bar = document.createElement("div");
		bar.className = "bar";
		const fill = document.createElement("span");
		fill.className = "fill";
		bar.append(fill);
		utilRow.append(util, bar);
		utilGroup.append(utilRow);
		const vram = document.createElement("span");
		vram.className = "gpu-vram";
		root.append(top, utilGroup, vram);
		return { root, name, temp, vram, util, fill };
	};

	const ensureGpuTiles = (gpus) => {
		if (gpus.length === 0) {
			if (state.gpusEmpty) {
				return;
			}
			el.gpus.replaceChildren();
			state.gpuTiles = [];
			const empty = document.createElement("div");
			empty.className = "empty";
			empty.textContent = "N/A · no NVIDIA GPU detected";
			el.gpus.append(empty);
			state.gpusEmpty = empty;
			return;
		}
		if (state.gpuTiles.length === gpus.length) {
			return;
		}
		el.gpus.replaceChildren();
		state.gpuTiles = [];
		state.gpusEmpty = null;
		for (let index = 0; index < gpus.length; index += 1) {
			const tile = createGpuTile();
			el.gpus.append(tile.root);
			state.gpuTiles.push(tile);
		}
	};

	const renderGpus = (gpus) => {
		ensureGpuTiles(gpus);
		el.gpuCount.textContent = gpus.length > 0 ? `${gpus.length} devices` : "N/A";
		gpus.forEach((gpu, index) => {
			const tile = state.gpuTiles[index];
			if (!tile) {
				return;
			}
			const util = finiteOrNull(gpu.utilization);
			const temp = finiteOrNull(gpu.temperature);
			const memUsed = finiteOrNull(gpu.memoryUsed);
			const memTotal = finiteOrNull(gpu.memoryTotal);
			const tempText = temp === null ? "N/A" : `${Math.round(temp)}°C`;
			tile.name.textContent = `GPU ${gpu.index}`;
			tile.vram.textContent = formatGpuPair(memUsed, memTotal);
			tile.util.textContent = formatPercent(util);
			tile.fill.style.width = `${util === null ? 0 : clamp(util, 0, 100)}%`;
			tile.temp.textContent = tempText;
			tile.temp.classList.toggle("warn", temp !== null && temp >= 80 && temp < 90);
			tile.temp.classList.toggle("crit", temp !== null && temp >= 90);
			tile.root.title = `${gpu.name || `GPU ${gpu.index}`} · VRAM ${formatPair(memUsed, memTotal)} · util ${formatPercent(util)} · ${tempText}`;
		});
	};

	const render = (snapshot) => {
		const interval = finiteOrNull(snapshot.refreshInterval);
		if (interval !== null) {
			if (interval !== state.refreshInterval) {
				resetHistory();
			}
			state.refreshInterval = interval;
			el.interval.textContent = formatInterval(interval);
		}
		renderCpu(snapshot.cpu ?? {});
		renderMemory(snapshot.memory ?? {});
		renderIo(snapshot.io ?? {});
		renderDisks(Array.isArray(snapshot.disks) ? snapshot.disks : []);
		renderGpus(Array.isArray(snapshot.gpus) ? snapshot.gpus : []);
	};

	window.addEventListener("message", (event) => {
		const message = event.data;
		if (!message || typeof message !== "object") {
			return;
		}
		if (message.type === "snapshot" && message.data) {
			render(message.data);
			return;
		}
		if (message.type === "config") {
			const interval = finiteOrNull(message.refreshInterval);
			if (interval !== null) {
				if (interval !== state.refreshInterval) {
					resetHistory();
				}
				state.refreshInterval = interval;
				el.interval.textContent = formatInterval(interval);
			}
			return;
		}
		if (message.type === "reset") {
			resetHistory();
		}
	});

	el.settings.addEventListener("click", () => {
		vscode.postMessage({ type: "openSettings" });
	});

	vscode.postMessage({ type: "ready" });
})();
