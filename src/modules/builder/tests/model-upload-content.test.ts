import { describe, expect, it } from "vitest";

import {
  buildModelUploadText,
  docxVisualContextNote,
  isModelImage,
  serializeModelUpload,
} from "../uploads/model-content";
import { formatHtmlSource } from "../content/format-html";
import { formatModelPayload } from "../uploads/format-model-payload";

describe("model upload content", () => {
  it("classifies normalized image filenames", () => {
    expect(isModelImage("hero.PNG ")).toBe(true);
    expect(isModelImage("hero.svg")).toBe(false);
  });

  it("states explicitly when DOCX visual rendering is unavailable", () => {
    expect(docxVisualContextNote(0)).toContain(
      "use the structural extract only",
    );
    expect(docxVisualContextNote(2)).toContain(
      "2 rendered Word page images are attached",
    );
  });
  it("preserves the stored parsed content used by the model", () => {
    expect(
      buildModelUploadText({
        name: "source.docx",
        mediaType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        extractedText: "<p>Parsed Word content</p>",
      }),
    ).toBe("<p>Parsed Word content</p>");
  });

  it("describes binary uploads and their expected asset path", () => {
    expect(
      buildModelUploadText(
        {
          name: "hero.png",
          mediaType: "image/png",
          extractedText: null,
        },
        "/uploads/story/hero.webp",
      ),
    ).toBe(
      "Binary reference: hero.png (image/png). Expected Article HTML Asset Path: /uploads/story/hero.webp",
    );
  });

  it("serializes the exact reference fragment passed to the model", () => {
    expect(
      serializeModelUpload({
        id: "upload-1",
        index: 2,
        name: "source.docx",
        mediaType: "application/docx",
        text: "<p>Parsed Word content</p>",
      }),
    )
      .toBe(`<reference-upload index="2" id="upload-1" name="source.docx" media-type="application/docx">
<p>Parsed Word content</p>
</reference-upload>`);
  });

  it("uses the canonical Article HTML formatter for markup", async () => {
    const payload =
      '<reference-upload index="1"><h1>Title</h1><p><strong>Lead.</strong> Body.</p><p><img alt="A > B" src="image" /></p></reference-upload>';
    const expected = await formatHtmlSource(payload);

    await expect(formatModelPayload(payload)).resolves.toBe(expected);
  });

  it("does not rewrite canonically formatted payloads differently", async () => {
    const payload = await formatHtmlSource(
      '<reference-upload index="1"><p><strong><em>These are not peripheral assets.</em></strong></p></reference-upload>',
    );

    await expect(formatModelPayload(payload)).resolves.toBe(payload);
  });

  it("leaves plain-text model payloads unchanged", async () => {
    await expect(
      formatModelPayload("Plain reference text\nwith two lines."),
    ).resolves.toBe("Plain reference text\nwith two lines.");
  });
});
