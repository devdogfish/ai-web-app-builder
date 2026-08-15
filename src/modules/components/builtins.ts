import type { ComponentDefinitionInput } from "./contracts";

function source(strings: TemplateStringsArray, ...values: string[]): string {
  return String.raw({ raw: strings }, ...values).trim();
}

export const BUILTIN_COMPONENTS: readonly ComponentDefinitionInput[] = [
  {
    source: source`
const DEFAULT_TABS = [
  { label: "First tab", content: "<p>First tab content.</p>" },
  { label: "Second tab", content: "<p>Second tab content.</p>" },
];

type Props = {
  tabs: Array<{
    label: string;
    content: React.ReactNode;
  }>;
};

/** Interactive labeled tabs, each containing custom rich HTML. */
export default function Tabs({ tabs = DEFAULT_TABS }: Props) {
  return (
    <>
      <div
        className="article-tabs"
        style={{ border: "1px solid #d8d8d8", borderRadius: "8px", overflow: "hidden" }}
      >
        <div
          className="article-tabs__list"
          role="tablist"
          style={{ display: "flex", gap: "0", borderBottom: "1px solid #d8d8d8" }}
        >
          {tabs.map((tab, index) => (
            <button
              className="article-tabs__tab"
              type="button"
              role="tab"
              data-tab-index={index}
              style={{ appearance: "none", border: "0", background: "#f5f5f5", cursor: "pointer", padding: ".75rem 1rem" }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {tabs.map((tab, index) => (
          <div
            className="article-tabs__panel"
            role="tabpanel"
            data-tab-panel={index}
            style={{ padding: "1rem" }}
          >
            {tab.content}
          </div>
        ))}
      </div>
      <script>{\`
        (() => {
          const root = document.currentScript?.previousElementSibling;
          if (!root || !root.classList.contains("article-tabs")) return;
          const tabs = [...root.querySelectorAll("[data-tab-index]")];
          const panels = [...root.querySelectorAll("[data-tab-panel]")];
          const activate = (index) => {
            tabs.forEach((tab, itemIndex) => {
              const selected = itemIndex === index;
              tab.setAttribute("aria-selected", String(selected));
              tab.style.background = selected ? "#fff" : "#f5f5f5";
              tab.style.fontWeight = selected ? "700" : "400";
            });
            panels.forEach((panel, itemIndex) => { panel.hidden = itemIndex !== index; });
          };
          tabs.forEach((tab, index) => tab.addEventListener("click", () => activate(index)));
          activate(0);
        })();
      \`}</script>
    </>
  );
}
`,
  },
  {
    source: source`
type Props = {
  quote: React.ReactNode;
  author: string;
  image: ImageSource;
  imageAlt: string;
};

/** A rich quotation with author byline and portrait image. */
export default function AttributedQuote({
  quote = "<p>Add the quotation.</p>",
  author = "Author name",
  image = "/images/author.jpg",
  imageAlt = "Portrait of the author",
}: Props) {
  return (
    <figure
      className="attributed-quote"
      style={{ display: "grid", gridTemplateColumns: "5rem 1fr", gap: "1rem", alignItems: "start", margin: "1.5rem 0" }}
    >
      <img
        className="attributed-quote__image"
        src={image}
        alt={imageAlt}
        style={{ borderRadius: "999px", height: "5rem", objectFit: "cover", width: "5rem" }}
      />
      <figcaption>
        <blockquote style={{ margin: "0 0 .5rem" }}>{quote}</blockquote>
        <cite style={{ fontStyle: "normal", fontWeight: "700" }}>{author}</cite>
      </figcaption>
    </figure>
  );
}
`,
  },
  {
    source: source`
const DEFAULT_IMAGES = [
  { src: "/images/slide.jpg", alt: "", caption: "<p>Add a caption.</p>" },
];

type Props = {
  images: Array<{
    src: ImageSource;
    alt: string;
    caption: React.ReactNode;
  }>;
};

/** Interactive previous/next carousel for images with rich captions. */
export default function ImageCarousel({ images = DEFAULT_IMAGES }: Props) {
  return (
    <>
      <div className="article-carousel" style={{ margin: "1.5rem 0", position: "relative" }}>
        <div className="article-carousel__slides">
          {images.map((image, index) => (
            <figure className="article-carousel__slide" data-carousel-slide={index}>
              <img src={image.src} alt={image.alt} style={{ display: "block", height: "auto", width: "100%" }} />
              <figcaption>{image.caption}</figcaption>
            </figure>
          ))}
        </div>
        <div
          className="article-carousel__controls"
          style={{ display: "flex", justifyContent: "space-between", marginTop: ".5rem" }}
        >
          <button type="button" data-carousel-previous>Previous</button>
          <button type="button" data-carousel-next>Next</button>
        </div>
      </div>
      <script>{\`
        (() => {
          const root = document.currentScript?.previousElementSibling;
          if (!root || !root.classList.contains("article-carousel")) return;
          const slides = [...root.querySelectorAll("[data-carousel-slide]")];
          let current = 0;
          const show = (index) => {
            current = (index + slides.length) % slides.length;
            slides.forEach((slide, itemIndex) => { slide.hidden = itemIndex !== current; });
          };
          root.querySelector("[data-carousel-previous]")?.addEventListener("click", () => show(current - 1));
          root.querySelector("[data-carousel-next]")?.addEventListener("click", () => show(current + 1));
          if (slides.length) show(0);
        })();
      \`}</script>
    </>
  );
}
`,
  },
] as const;
