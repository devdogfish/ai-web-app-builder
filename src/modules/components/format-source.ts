/** Formats self-contained React TypeScript like the project's VS Code setup. */
export async function formatComponentSource(source: string): Promise<string> {
  const [{ format }, estreePlugin, typescriptPlugin] = await Promise.all([
    import("prettier/standalone"),
    import("prettier/plugins/estree"),
    import("prettier/plugins/typescript"),
  ]);

  return format(source, {
    parser: "typescript",
    plugins: [estreePlugin.default, typescriptPlugin.default],
    printWidth: 80,
  });
}
