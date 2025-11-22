export default {
  project: process.env.TRIGGER_PROJECT || "proj_naaseftufwbqfmmzzdth",
  runtime: "node",
  logLevel: "info",
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
    },
  },
  enableIdempotency: true,
  concurrencyLimit: 50,
  // v4 requires this (>= 5 seconds). Adjust as needed.
  maxDuration: 60,
} as any;
