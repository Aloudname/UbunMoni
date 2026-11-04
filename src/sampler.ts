import * as os from "os";
import * as si from "systeminformation";
import { GpuSample, GpuSampler } from "./gpu";

export interface DiskSample {
	mount: string;
	size: number;
	used: number;
	percent: number;
}

export interface Snapshot {
	timestamp: number;
	cpu: {
		usage: number | null;
		threads: number;
		model: string;
	};
	memory: {
		used: number | null;
		active: number | null;
		total: number | null;
	};
	io: {
		read: number | null;
		write: number | null;
	};
	disks: DiskSample[];
	gpus: GpuSample[];
}

const DISK_CACHE_MS = 10_000;
const MAX_DISKS = 4;
const PSEUDO_FILESYSTEMS = new Set([
	"tmpfs",
	"devtmpfs",
	"squashfs",
	"proc",
	"sysfs",
	"cgroup",
	"cgroup2",
	"ramfs",
	"devpts",
	"mqueue",
	"hugetlbfs",
	"tracefs",
	"debugfs",
	"securityfs",
	"pstore",
	"bpf",
	"autofs",
	"configfs",
	"fusectl",
	"nsfs",
	"binfmt_misc",
	"efivarfs",
	"rpc_pipefs",
]);

const finiteOrNull = (value: number | null | undefined): number | null =>
	typeof value === "number" && Number.isFinite(value) ? value : null;

const nonNegativeOrNull = (value: number | null | undefined): number | null => {
	const finite = finiteOrNull(value);
	return finite !== null && finite >= 0 ? finite : null;
};

const safe = async <T>(load: () => Promise<T>): Promise<T | null> => {
	try {
		return await load();
	} catch {
		return null;
	}
};

const clampPercent = (value: number): number =>
	Math.min(100, Math.max(0, value));

export class MonitorSampler {
	private readonly gpuSampler = new GpuSampler();
	private readonly cpus = os.cpus();
	private diskCache: { at: number; disks: DiskSample[] } = {
		at: 0,
		disks: [],
	};
	private inFlight = false;

	async sample(): Promise<Snapshot | null> {
		if (this.inFlight) {
			return null;
		}
		this.inFlight = true;
		try {
			const [load, memory, io, gpus, disks] = await Promise.all([
				safe(() => si.currentLoad()),
				safe(() => si.mem()),
				safe(() => si.fsStats()),
				safe(() => this.gpuSampler.sample()),
				safe(() => this.readDisks()),
			]);

			const usage = finiteOrNull(load?.currentLoad);
			const snapshot: Snapshot = {
				timestamp: Date.now(),
				cpu: {
					usage: usage === null ? null : clampPercent(usage),
					threads: this.cpus.length,
					model: this.cpus[0]?.model ?? "",
				},
				memory: {
					used: nonNegativeOrNull(memory?.used),
					active: nonNegativeOrNull(memory?.active),
					total: nonNegativeOrNull(memory?.total),
				},
				io: {
					read: nonNegativeOrNull(io?.rx_sec),
					write: nonNegativeOrNull(io?.wx_sec),
				},
				disks: disks ?? [],
				gpus: gpus ?? [],
			};
			return snapshot;
		} finally {
			this.inFlight = false;
		}
	}

	private async readDisks(): Promise<DiskSample[]> {
		const now = Date.now();
		if (now - this.diskCache.at < DISK_CACHE_MS) {
			return this.diskCache.disks;
		}

		const sizes = await safe(() => si.fsSize());
		if (!sizes) {
			return this.diskCache.disks;
		}

		const disks = sizes
			.filter(
				(disk) =>
					disk.size > 0 &&
					!PSEUDO_FILESYSTEMS.has(disk.type) &&
					!disk.mount.startsWith("/snap/") &&
					!disk.mount.startsWith("/sys/") &&
					!disk.mount.startsWith("/proc/")
			)
			.map((disk) => ({
				mount: disk.mount,
				size: disk.size,
				used: disk.used,
				percent: clampPercent(
					Number.isFinite(disk.use) && disk.use >= 0
						? disk.use
						: disk.size > 0
							? (disk.used / disk.size) * 100
							: 0
				),
			}))
			.sort((a, b) => {
				if (a.mount === "/") {
					return -1;
				}
				if (b.mount === "/") {
					return 1;
				}
				if (b.percent !== a.percent) {
					return b.percent - a.percent;
				}
				return b.size - a.size;
			})
			.slice(0, MAX_DISKS);

		this.diskCache = { at: now, disks };
		return disks;
	}
}
