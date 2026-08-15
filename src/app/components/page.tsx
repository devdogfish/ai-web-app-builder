import type { Metadata } from "next";
import { connection } from "next/server";

import { ComponentLibraryPage } from "@/modules/components/ui/component-library-page";
import { getComponentRepository } from "@/modules/components/server";

export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Component Library · Article Builder",
  description:
    "Create typed TSX Components that compile to standalone article HTML.",
};

export default async function ComponentsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string | string[] }>;
}) {
  await connection();
  const { edit } = await searchParams;
  return (
    <ComponentLibraryPage
      initialDefinitions={getComponentRepository().list()}
      initialEditingId={typeof edit === "string" ? edit : null}
    />
  );
}
