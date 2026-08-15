export async function formatHtmlSource(source: string): Promise<string> {
  const [{ format }, htmlPlugin] = await Promise.all([
    import("prettier/standalone"),
    import("prettier/plugins/html"),
  ]);

  return format(source, {
    parser: "html",
    plugins: [htmlPlugin.default],
  });
}
