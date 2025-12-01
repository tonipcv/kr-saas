import { task } from "@trigger.dev/sdk/v3";
import { getPrisma } from "./prisma";

export const dbHealth = task({
  id: "db-health",
  run: async () => {
    const prisma = await getPrisma();
    const info = {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      env: {
        PRISMA_CLIENT_ENGINE_TYPE: process.env.PRISMA_CLIENT_ENGINE_TYPE || null,
        DATABASE_URL: process.env.DATABASE_URL ? "<set>" : null,
        NODE_ENV: process.env.NODE_ENV || null,
      },
    };

    console.log("[DB-HEALTH] Runtime:", info);

    try {
      const result = await prisma.$queryRawUnsafe<{ ok: number }[]>("SELECT 1 as ok");
      console.log("[DB-HEALTH] Query result:", result);
      return { ok: true, result };
    } catch (err: any) {
      const message = err?.message || String(err);
      const engineHint = message.includes("Query Engine for runtime")
        ? "BINARY engine in runtime (missing native engine file)."
        : message.toLowerCase().includes("libquery") || message.toLowerCase().includes("node-api")
        ? "Node-API engine in runtime"
        : "unknown";
      console.error("[DB-HEALTH] ERROR:", { name: err?.name, message, engineHint, stack: err?.stack?.split("\n").slice(0, 12).join("\n") });
      throw err;
    }
  },
});
