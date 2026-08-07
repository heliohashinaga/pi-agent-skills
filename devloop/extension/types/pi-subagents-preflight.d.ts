export interface SubagentLaunchContractResult {
	ok: boolean;
	code: string;
	message: string;
	contract?: { model?: string };
}

export function resolveSubagentLaunchContract(input: Record<string, unknown>): Promise<SubagentLaunchContractResult>;
