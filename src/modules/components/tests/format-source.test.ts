import { describe, expect, it } from "vitest";

import { formatComponentSource } from "../format-source";

describe("Component Source formatting", () => {
  it("formats React TypeScript", async () => {
    const source =
      'type Props={title:string};export default function Card({title=""}:Props){return <section><h2>{title}</h2></section>}';

    await expect(formatComponentSource(source)).resolves
      .toBe(`type Props = { title: string };
export default function Card({ title = "" }: Props) {
  return (
    <section>
      <h2>{title}</h2>
    </section>
  );
}
`);
  });

  it("wraps long destructured props at the VS Code default width", async () => {
    const source =
      'type Props={title:string;content:React.ReactNode};export default function NewComponent({title="Helima Croft, Head of Global Commodity Strategy and MENA Research, RBC Capital Markets",content="Quote text"}:Props){return <blockquote><p>{content}</p><p className="attribution">{title}</p></blockquote>}';

    await expect(formatComponentSource(source)).resolves
      .toBe(`type Props = { title: string; content: React.ReactNode };
export default function NewComponent({
  title = "Helima Croft, Head of Global Commodity Strategy and MENA Research, RBC Capital Markets",
  content = "Quote text",
}: Props) {
  return (
    <blockquote>
      <p>{content}</p>
      <p className="attribution">{title}</p>
    </blockquote>
  );
}
`);
  });
});
