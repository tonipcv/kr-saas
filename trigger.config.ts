import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: "proj_naaseftufwbqfmmzzdth",
  maxDuration: 300, // 5 minutes max per task execution
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ["./trigger"],
});
