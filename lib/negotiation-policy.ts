export type NegotiationPolicyInput = {
  targetTotal?: number;
  maxBudget?: number;
  maxRounds?: number;
  maxMessagesPerProvider?: number;
  followupHours?: number;
  satisfactionThreshold?: number;
};

export function normalizeNegotiationPolicy(
  input: NegotiationPolicyInput,
  defaultBudget?: number,
) {
  const targetTotal = input.targetTotal ?? defaultBudget;
  const maxBudget = input.maxBudget ?? defaultBudget;
  const maxRounds = input.maxRounds ?? 4;
  const maxMessagesPerProvider = input.maxMessagesPerProvider ?? 5;
  const followupHours = input.followupHours ?? 24;
  const satisfactionThreshold = input.satisfactionThreshold ?? 0.8;
  validateMoney(targetTotal, "Target total");
  validateMoney(maxBudget, "Maximum budget");
  if (
    targetTotal !== undefined &&
    maxBudget !== undefined &&
    targetTotal > maxBudget
  )
    throw new Error("Target total cannot exceed the maximum budget");
  if (!Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > 8)
    throw new Error("Maximum rounds must be a whole number from 1 to 8");
  if (
    !Number.isInteger(maxMessagesPerProvider) ||
    maxMessagesPerProvider < 1 ||
    maxMessagesPerProvider > 10
  )
    throw new Error("Maximum messages must be a whole number from 1 to 10");
  if (
    !Number.isFinite(followupHours) ||
    followupHours < 1 ||
    followupHours > 168
  )
    throw new Error("Follow-up window must be between 1 and 168 hours");
  if (
    !Number.isFinite(satisfactionThreshold) ||
    satisfactionThreshold < 0.5 ||
    satisfactionThreshold > 1
  )
    throw new Error("Satisfaction threshold must be between 0.5 and 1");
  return {
    targetTotal,
    maxBudget,
    maxRounds,
    maxMessagesPerProvider,
    followupHours,
    satisfactionThreshold,
  };
}

function validateMoney(value: number | undefined, label: string) {
  if (
    value !== undefined &&
    (!Number.isFinite(value) || value < 0 || value > 10_000_000)
  )
    throw new Error(`${label} must be a valid amount from 0 to 10,000,000`);
}
