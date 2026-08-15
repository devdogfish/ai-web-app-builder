import type { Metadata } from "next";
import { connection } from "next/server";

import { assertBuilderActionAccess } from "@/modules/builder/environment/request-resolver";
import { ComponentLibraryPage } from "@/modules/components/ui/component-library-page";
import { getComponentRepository } from "@/modules/components/server";

export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Component Library · Article Builder",
  description: "Create and manage reusable article HTML Components.",
};

export default async function ComponentsPage() {
  await connection();
  await assertBuilderActionAccess("read");
  return (
    <ComponentLibraryPage
      initialDefinitions={getComponentRepository().list()}
    />
  );
}
