import {
  defineConfig
} from "../chunk-ZVCL2B46.mjs";
import "../chunk-RA6RHLTU.mjs";
import {
  init_esm
} from "../chunk-NKKWNCEX.mjs";

// trigger.config.ts
init_esm();
var trigger_config_default = defineConfig({
  project: "proj_naaseftufwbqfmmzzdth",
  // 5 minutes max per task execution
  maxDuration: 300,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1e3,
      maxTimeoutInMs: 1e4,
      factor: 2,
      randomize: true
    }
  },
  dirs: ["./trigger"],
  build: {}
});
var resolveEnvVars = void 0;
export {
  trigger_config_default as default,
  resolveEnvVars
};
//# sourceMappingURL=trigger.config.mjs.map
