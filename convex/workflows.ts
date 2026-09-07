import { WorkflowManager } from "@convex-dev/workflow";
import { components } from "./_generated/api";

export const workflows = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    maxParallelism: 8,
    defaultRetryBehavior: {
      maxAttempts: 5,
      initialBackoffMs: 1_000,
      base: 2,
    },
    retryActionsByDefault: true,
  },
});
