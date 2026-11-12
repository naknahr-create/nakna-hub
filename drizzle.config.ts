import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: ["./db/schema.ts", "./db/line-auth-schema.ts", "./db/line-digest-schema.ts"],
  dialect: "sqlite",
});
