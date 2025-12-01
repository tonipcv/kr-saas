/*
 Diagnostic script for Prisma runtime in any environment (local or Trigger.dev Cloud)

 Usage:
   npx tsx scripts/diagnose-prisma-runtime.ts

 What it does:
 - Prints Node/OS, @prisma/client version, schema engineType, env PRISMA_CLIENT_ENGINE_TYPE
 - Lists node_modules/.prisma/client contents (engines present or not)
 - Attempts a trivial DB query and prints a structured error report if it fails
*/

import fs from "fs";
import path from "path";

async function main() {
  const cwd = process.cwd();
  function log(title: string, value: any) {
    const v = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    console.log(`\n== ${title} ==\n${v}`);
  }

  // 1) Basic runtime info
  log("Runtime", {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cwd,
    pid: process.pid,
    envSample: {
      PRISMA_CLIENT_ENGINE_TYPE: process.env.PRISMA_CLIENT_ENGINE_TYPE || null,
      DATABASE_URL: process.env.DATABASE_URL ? "<set>" : null,
      TRIGGER_SECRET_KEY: process.env.TRIGGER_SECRET_KEY ? "<set>" : null,
      NODE_ENV: process.env.NODE_ENV || null,
    },
  });

  // 2) Package versions
  let prismaClientVersion: string | null = null;
  try {
    const prismaClientPkg = require.resolve("@prisma/client/package.json", { paths: [cwd] });
    const pkgJson = JSON.parse(fs.readFileSync(prismaClientPkg, "utf8"));
    prismaClientVersion = pkgJson.version;
  } catch {}
  log("Packages", {
    "@prisma/client": prismaClientVersion,
  });

  // 3) Schema engineType
  const schemaPath = path.join(cwd, "prisma", "schema.prisma");
  let engineTypeInSchema: string | null = null;
  try {
    const schema = fs.readFileSync(schemaPath, "utf8");
    const m = schema.match(/engineType\s*=\s*"([^"]+)"/);
    engineTypeInSchema = m ? m[1] : null;
  } catch {}
  log("Schema", {
    path: schemaPath,
    engineType: engineTypeInSchema,
  });

  // 4) Check .prisma/client folder contents
  const enginesDir = path.join(cwd, "node_modules", ".prisma", "client");
  let enginesListing: string[] = [];
  try {
    if (fs.existsSync(enginesDir)) {
      enginesListing = fs.readdirSync(enginesDir).slice(0, 50);
    }
  } catch {}
  log(".prisma/client listing", enginesListing);

  // 5) Try a trivial DB query
  let outcome: any = null;
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    // Try a fast metadata call
    const result = await prisma.$queryRawUnsafe("SELECT 1 as ok");
    outcome = { ok: true, result };
    await prisma.$disconnect();
  } catch (err: any) {
    const message = err?.message || String(err);
    const engineHint =
      message.includes("could not locate the Query Engine")
        ? "Likely using BINARY engine at runtime (missing native engine file)."
        : message.toLowerCase().includes("node-api") || message.includes("libquery")
        ? "Likely using NODE-API engine at runtime."
        : "Unknown";

    outcome = {
      ok: false,
      name: err?.name,
      message,
      code: (err as any)?.code || (err as any)?.errorCode || null,
      clientVersion: (err as any)?.clientVersion || null,
      engineHint,
      stack: err?.stack?.split("\n").slice(0, 12).join("\n"),
    };
  }
  log("DB probe", outcome);

  // 6) Summary
  const summary = {
    conclusion:
      outcome?.ok
        ? "Prisma is working in this environment."
        : outcome?.engineHint || "See error above.",
    nextSteps: outcome?.ok
      ? []
      : [
          "If engineHint says BINARY: ensure schema engineType=\"library\", set PRISMA_CLIENT_ENGINE_TYPE=library, and rebuild with clean install.",
          "Ensure DATABASE_URL is correct and reachable from this environment (SSL if required: ?sslmode=require).",
        ],
  };
  log("Summary", summary);
}

main().catch((e) => {
  console.error("Fatal error in diagnose script:", e);
  process.exit(1);
});
