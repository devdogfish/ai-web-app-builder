import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: [
    "./src/modules/builder/db/schema.ts",
    "./src/modules/article-images/db/schema.ts",
  ],
  out: "./src/modules/builder/db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url:
      process.env.ARTICLE_BUILDER_DATABASE_PATH ??
      ".data/article-builder.sqlite",
  },
  strict: true,
  verbose: true,
});
