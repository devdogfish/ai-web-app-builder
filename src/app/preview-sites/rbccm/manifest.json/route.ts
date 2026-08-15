import manifest from "@/modules/builder/preview/generated/rbccm-asset-manifest.json";

export const dynamic = "force-static";
export function GET() {
  return Response.json(manifest);
}
