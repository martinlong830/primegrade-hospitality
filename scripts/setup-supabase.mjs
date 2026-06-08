#!/usr/bin/env node
/**
 * Apply schema.sql and verify Supabase connection.
 *
 * First-time setup:
 * 1. Copy .env.local.example → .env.local (already done if keys are set)
 * 2. Run supabase/schema.sql in Supabase Dashboard → SQL Editor
 *    OR set SUPABASE_DB_URL and run: npm run supabase:setup
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(root, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    /* no .env.local */
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const dbUrl = process.env.SUPABASE_DB_URL;

async function applySchemaViaPg() {
  if (!dbUrl) return false;
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const sql = readFileSync(resolve(root, "supabase/schema.sql"), "utf8");
  await client.query(sql);
  await client.end();
  console.log("✓ Schema applied via direct Postgres connection");
  return true;
}

async function getClient() {
  if (!url || !secretKey) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local");
  }
  return createClient(url, secretKey);
}

async function tableExists(supabase, table) {
  const { error } = await supabase.from(table).select("*").limit(1);
  if (!error) return true;
  if (error.code === "PGRST205") return false;
  throw error;
}

async function main() {
  console.log("Supabase setup for", url ?? "(no URL configured)");

  try {
    await applySchemaViaPg();
  } catch (err) {
    console.warn("Could not apply schema via Postgres:", err.message);
    console.log("→ Run supabase/schema.sql manually in the Supabase SQL Editor");
  }

  const supabase = await getClient();

  const required = ["users", "stations", "task_sections", "tasks", "map_zones", "map_layout"];
  const missing = [];
  for (const table of required) {
    const exists = await tableExists(supabase, table);
    if (exists) {
      console.log(`✓ ${table}`);
    } else {
      missing.push(table);
      console.log(`✗ ${table} — missing`);
    }
  }

  if (missing.length) {
    console.log(
      "\nRun the full contents of supabase/schema.sql in:\n" +
        "  https://supabase.com/dashboard/project/aablqjupqgkhjmpujwaj/sql/new\n"
    );
    process.exit(1);
  }

  const { count } = await supabase.from("users").select("*", { count: "exact", head: true });
  console.log(`\n✓ Connected — ${count ?? 0} user(s) in database`);
  console.log("Restart npm run dev and reload the app.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
