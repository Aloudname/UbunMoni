import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface GpuSample {
	index: number;
	name: string;
	utilization: number | null;
	memoryUsed: number | null;
	memoryTotal: number | null;
	temperature: number | null;
}

const MIB = 1024 * 1024;
const MISSING_RETRY_MS = 60_000;
const ERROR_RETRY_MS = 10_000;
const QUERY = [
	"index",
	"name",
	"utilization.gpu",
	"memory.used",
	"memory.total",
	"temperature.gpu",
].join(",");

const parseNumber = (value: string): number | null => {
	const trimmed = value.trim();
	if (!trimmed || trimmed.toUpperCase().includes("N/A")) {
		return null;
	}
	const parsed = Number(trimmed);
	return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Parses `nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu`.
 * The name is allowed to contain commas; the last three columns are always numeric.
 */
export const parseGpuCsv = (stdout: string): GpuSample[] => {
	const samples: GpuSample[] = [];
	for (const line of stdout.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		const parts = trimmed.split(",").map((part) => part.trim());
		if (parts.length < 6) {
			continue;
		}
		const index = parseNumber(parts[0]);
		const utilization = parseNumber(parts[parts.length - 4]);
		const memoryUsedMib = parseNumber(parts[parts.length - 3]);
		const memoryTotalMib = parseNumber(parts[parts.length - 2]);
		const temperature = parseNumber(parts[parts.length - 1]);
		if (index === null) {
			continue;
		}
		samples.push({
			index,
			name: parts.slice(1, -4).join(", "),
			utilization,
			memoryUsed: memoryUsedMib === null ? null : memoryUsedMib * MIB,
			memoryTotal: memoryTotalMib === null ? null : memoryTotalMib * MIB,
			temperature,
		});
	}
	return samples.sort((a, b) => a.index - b.index);
};

export class GpuSampler {
	private unavailableUntil = 0;

	async sample(): Promise<GpuSample[]> {
		if (Date.now() < this.unavailableUntil) {
			return [];
		}
		try {
			const { stdout } = await execFileAsync(
				"nvidia-smi",
				[`--query-gpu=${QUERY}`, "--format=csv,noheader,nounits"],
				{ timeout: 2000, maxBuffer: 1024 * 1024 }
			);
			return parseGpuCsv(stdout);
		} catch (error) {
			const code = (error as NodeJS.ErrnoException | undefined)?.code;
			this.unavailableUntil =
				Date.now() + (code === "ENOENT" ? MISSING_RETRY_MS : ERROR_RETRY_MS);
			return [];
		}
	}
}
