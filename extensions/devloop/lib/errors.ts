/**
 * Typed delegation error for devloop.
 *
 * Replaces string-matching (`message.includes("timed out")`) with a machine-readable
 * `kind` field, so the controller can route salvage vs. escalation without coupling
 * to the English prose in `delegate.ts`. This also lets `retro-agent.ts` distinguish
 * a timeout from a hard failure when recommending replanning.
 */
export type DevloopDelegationErrorKind = "timed_out" | "cancelled" | "failed";

export class DevloopDelegationError extends Error {
	/** Machine-readable category; never derived from message text. */
	readonly kind: DevloopDelegationErrorKind;
	/** The agent that failed (undefined when not yet dispatched). */
	readonly agent?: string;

	constructor(
		kind: DevloopDelegationErrorKind,
		message: string,
		options?: { agent?: string; cause?: unknown },
	) {
		super(message, options);
		this.name = "DevloopDelegationError";
		this.kind = kind;
		this.agent = options?.agent;
	}
}
