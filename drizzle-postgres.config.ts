import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "pg",
  dbCredentials: {
    url: process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING || "postgresql://postgres:postgres@localhost:5432/coinhunter",
  },
});
