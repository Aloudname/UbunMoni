import * as vscode from "vscode";
import { COMMAND_OPEN, CONFIG_SECTION, VIEW_ID } from "./configuration";
import { MonitorPanelProvider } from "./panel";

export const activate = (context: vscode.ExtensionContext): void => {
	const provider = new MonitorPanelProvider(context.extensionUri);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
			webviewOptions: { retainContextWhenHidden: true },
		}),
		vscode.commands.registerCommand(COMMAND_OPEN, async () => {
			await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
		}),
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration(`${CONFIG_SECTION}.refreshInterval`)) {
				provider.refreshRateChanged();
			}
		}),
		{ dispose: () => provider.dispose() }
	);
};
