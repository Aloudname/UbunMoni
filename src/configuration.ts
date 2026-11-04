import * as vscode from "vscode";

export const CONFIG_SECTION = "ubunmoni";
export const VIEW_ID = "ubunmoni.view";
export const COMMAND_OPEN = "ubunmoni.open";

const DEFAULT_INTERVAL = 1000;
const MIN_INTERVAL = 250;
const MAX_INTERVAL = 60_000;

export const getRefreshInterval = (): number => {
	const configured = vscode.workspace
		.getConfiguration(CONFIG_SECTION)
		.get<number>("refreshInterval", DEFAULT_INTERVAL);

	if (typeof configured !== "number" || !Number.isFinite(configured)) {
		return DEFAULT_INTERVAL;
	}
	return Math.min(
		MAX_INTERVAL,
		Math.max(MIN_INTERVAL, Math.round(configured))
	);
};
