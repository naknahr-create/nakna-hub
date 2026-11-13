import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: ["./db/schema.ts", "./db/line-auth-schema.ts", "./db/line-digest-schema.ts", "./db/hub-billing-schema.ts", "./db/hub-admin-schema.ts"],
  dialect: "sqlite",
});
