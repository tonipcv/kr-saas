import {
  init_esm
} from "../chunk-UMSOOAUP.mjs";

// trigger.config.ts
init_esm();
var trigger_config_default = {
  project: process.env.TRIGGER_PROJECT || "proj_naaseftufwbqfmmzzdth",
  runtime: "node",
  logLevel: "info",
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1e3,
      maxTimeoutInMs: 1e4,
      factor: 2
    }
  },
  enableIdempotency: true,
  concurrencyLimit: 50,
  // v4 requires this (>= 5 seconds). Adjust as needed.
  maxDuration: 60,
  build: {}
};
var resolveEnvVars = void 0;
export {
  trigger_config_default as default,
  resolveEnvVars
};
//# sourceMappingURL=trigger.config.mjs.map
