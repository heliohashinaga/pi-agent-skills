import { spawnSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { cpus } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { Type } from "typebox";
import type { AutocompleteItem, ExtensionAPI } from "@earendil-works/pi-coding-agent";

const EXT_NAME = "orchestration-advisor";
const EXT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = resolve(EXT_DIR, "..", "..", "skills", EXT_NAME);
const DEBUG_LOG = "/tmp/orchestration-advisor-extension.log";

type Tier = "single" | "semi" | "full";
type Strategy = "sequential" | "hybrid" | "parallel";

type Thresholds = {
	singleMaxMb: number;
	semiMaxMb: number;
};

type ResourceSnapshot = {
	effective_total_mb: number;
	available_mb: number;
	cpu_cores: number;
	swap_total_mb: number;
	swap_used_mb: number;
	swap_percent: number;
	disk_free_gb: number;
	detection_source: string;
};

const SUBCOMMANDS: Record<"advise", { value: string; label: string; description: string }> = {
	advise: { value: "advise", label: "advise", description: "Detect capacity and recommend the best orchestration strategy" },
};

function correlationId() {
	return `pi-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso() {
	return new Date().toISOString();
}

function epochMs() {
	return Date.now();
}

function logDebug(message: string) {
	if (process.env.ADAPTIVE_EXTENSION_DEBUG === "1") {
		try {
			writeFileSync(DEBUG_LOG, `${nowIso()} ${message}\n`, { flag: "a" });
		} catch {
			// best effort
		}
	}
}

function readJsonFile<T>(path: string): T | null {
	try {
		return JSON.parse(readFileSync(path, "utf8")) as T;
	} catch {
		return null;
	}
}

function loadConfig(): any {
	return readJsonFile<any>(join(SKILL_DIR, "orchestration.config.json")) ?? {};
}

function getThresholds(): Thresholds {
	const cfg = loadConfig();
	const custom = cfg?.detection?.memoryThresholdsMb;
	if (custom) {
		return {
			singleMaxMb: Number(custom.single ?? 4096),
			semiMaxMb: Number(custom.semi ?? 8192),
		};
	}

	const ramThresholds = cfg?.detection?.ramThresholds;
	if (Array.isArray(ramThresholds) && ramThresholds.length >= 3) {
		const single = ramThresholds.find((t: any) => t.tier === "single");
		const semi = ramThresholds.find((t: any) => t.tier === "semi");
		return {
			singleMaxMb: Number((single?.max ?? 4) * 1024),
			semiMaxMb: Number((semi?.max ?? 8) * 1024),
		};
	}

	return { singleMaxMb: 4096, semiMaxMb: 8192 };
}

function parseMeminfo(): Record<string, number> {
	const result: Record<string, number> = {};
	try {
		const text = readFileSync("/proc/meminfo", "utf8");
		for (const line of text.split("\n")) {
			const match = /^([A-Za-z_]+):\s+(\d+)\s+kB$/.exec(line.trim());
			if (match) result[match[1]] = Number(match[2]);
		}
	} catch {
		// ignore
	}
	return result;
}

function readFirstExisting(paths: string[]): string | null {
	for (const p of paths) {
		try {
			if (existsSync(p)) return readFileSync(p, "utf8").trim();
		} catch {
			// ignore
		}
	}
	return null;
}

function mbFromBytes(value: string): number | null {
	if (!value || value === "max") return null;
	const n = Number.parseInt(value, 10);
	if (!Number.isFinite(n) || n <= 0) return null;
	return Math.floor(n / 1024 / 1024);
}

function getCgroupLimitMb(): number | null {
	const v2 = readFirstExisting(["/sys/fs/cgroup/memory.max"]);
	if (v2 !== null) return mbFromBytes(v2);
	const v1 = readFirstExisting(["/sys/fs/cgroup/memory/memory.limit_in_bytes"]);
	if (v1 !== null) return mbFromBytes(v1);
	return null;
}

function getCpuCores(): number {
	return Math.max(1, cpus()?.length ?? 1);
}

function readResourceSnapshot(): ResourceSnapshot {
	const effectiveLimit = getCgroupLimitMb();
	const meminfo = parseMeminfo();
	const effective_total_mb = effectiveLimit && effectiveLimit > 0 ? effectiveLimit : Math.floor((meminfo.MemTotal ?? 0) / 1024);
	const available_mb = Math.min(
		effective_total_mb,
		Math.floor((meminfo.MemAvailable ?? meminfo.MemFree ?? 0) / 1024),
	);
	const swap_total_mb = Math.floor((meminfo.SwapTotal ?? 0) / 1024);
	const swap_free_mb = Math.floor((meminfo.SwapFree ?? 0) / 1024);
	const swap_used_mb = Math.max(0, swap_total_mb - swap_free_mb);
	const swap_percent = swap_total_mb > 0 ? Math.floor((swap_used_mb * 100) / swap_total_mb) : 0;
	const diskStat = spawnSync("df", ["-Pk", process.cwd()], { encoding: "utf8" });
	let disk_free_gb = 0;
	if (diskStat.status === 0 && diskStat.stdout) {
		const lines = diskStat.stdout.trim().split(/\r?\n/);
		if (lines.length >= 2) {
			const cols = lines[1].trim().split(/\s+/);
			disk_free_gb = Math.floor(Number(cols[3] ?? 0) / 1024 / 1024);
		}
	}
	return {
		effective_total_mb,
		available_mb,
		cpu_cores: getCpuCores(),
		swap_total_mb,
		swap_used_mb,
		swap_percent,
		disk_free_gb,
		detection_source: effectiveLimit && effectiveLimit > 0 ? "cgroup" : "proc",
	};
}

function detectTier(snapshot: ResourceSnapshot): Tier {
	const { singleMaxMb, semiMaxMb } = getThresholds();
	if (snapshot.effective_total_mb < singleMaxMb || snapshot.available_mb < 2048) return "single";
	if (snapshot.effective_total_mb < semiMaxMb) return "semi";
	return "full";
}

function maxWorkersForTier(tier: Tier, cpuCores: number): number {
	if (tier === "single") return 1;
	if (tier === "semi") return 2;
	return Math.max(1, cpuCores - 1);
}

function recommendStrategy(tier: Tier): Strategy {
	if (tier === "single") return "sequential";
	if (tier === "semi") return "hybrid";
	return "parallel";
}

function strategyRationale(tier: Tier): string {
	if (tier === "single") return "Low available resources favor sequential orchestration.";
	if (tier === "semi") return "Moderate resources support a hybrid orchestration strategy.";
	return "Sufficient resources support parallel orchestration.";
}

function buildAdviseResult(correlation: string, startedMs: number) {
	const snapshot = readResourceSnapshot();
	const tier = detectTier(snapshot);
	const recommended_strategy = recommendStrategy(tier);
	return {
		correlation_id: correlation,
		analyzed_at: nowIso(),
		duration_ms: epochMs() - startedMs,
		tier,
		recommended_strategy,
		recommended_parallelism: maxWorkersForTier(tier, snapshot.cpu_cores),
		rationale: strategyRationale(tier),
		diagnostics: snapshot,
	};
}

function parseArgs(argsRaw: string) {
	const tokens = String(argsRaw || "").trim().split(/\s+/).filter(Boolean);
	const out: { cmd: string; rest: string[] } = { cmd: "advise", rest: [] };
	if (tokens.length) {
		out.cmd = tokens[0].toLowerCase();
		out.rest = tokens.slice(1);
	}
	return out;
}

function completions(prefix: string): AutocompleteItem[] {
	const normalized = prefix.trim().toLowerCase();
	return Object.values(SUBCOMMANDS)
		.filter((item) => item.value.startsWith(normalized))
		.map((item) => ({ value: item.value, label: item.label, description: item.description }));
}

function formatOutput(result: any) {
	return JSON.stringify(result, null, 2);
}

export default function orchestrationAdvisorExtension(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		try {
			ctx.ui.setStatus(EXT_NAME, "ready");
		} catch {
			// best effort
		}
		ctx.ui.notify(`${EXT_NAME} loaded`, "info");
		logDebug("extension loaded");
	});

	pi.registerCommand(EXT_NAME, {
		description: "Orchestration advisor: advise",
		getArgumentCompletions(argumentPrefix: string) {
			return completions(argumentPrefix);
		},
		handler: async (args, ctx) => {
			const { cmd } = parseArgs(String(args || ""));
			const startedMs = epochMs();
			const corr = correlationId();

			if (cmd === "advise") {
				const result = buildAdviseResult(corr, startedMs);
				ctx.ui.notify(`advise: tier=${result.tier} strategy=${result.recommended_strategy} parallelism=${result.recommended_parallelism}`, result.tier === "single" ? "warning" : "success");
				ctx.ui.notify(formatOutput(result), "info");
				return;
			}

			ctx.ui.notify(`Unknown subcommand: ${cmd}. Use /${EXT_NAME} advise`, "error");
		},
	});

	pi.registerTool({
		name: "orchestration_advisor_advise",
		label: "Orchestration Advisor: Advise",
		description: "Detect machine capacity and recommend the best orchestration strategy.",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const result = buildAdviseResult(correlationId(), epochMs());
			ctx.ui.notify(`orchestration-advisor advise corr=${result.correlation_id}`, result.tier === "single" ? "warning" : "success");
			return { content: [{ type: "text", text: formatOutput(result) }], details: {} };
		},
	});
}
