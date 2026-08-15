import type { ComponentDefinitionInput } from "./contracts";

const tabsCss = `
.article-tabs { border: 1px solid #d8d8d8; border-radius: 8px; overflow: hidden; }
.article-tabs__list { display: flex; gap: 0; border-bottom: 1px solid #d8d8d8; }
.article-tabs__tab { appearance: none; border: 0; background: #f5f5f5; cursor: pointer; padding: .75rem 1rem; }
.article-tabs__tab[aria-selected="true"] { background: #fff; font-weight: 700; }
.article-tabs__panel { padding: 1rem; }
`.trim();

const tabsScript = `
(() => {
  const root = document.currentScript?.previousElementSibling;
  if (!root || !root.classList.contains("article-tabs")) return;
  const tabs = [...root.querySelectorAll("[data-tab-index]")];
  const panels = [...root.querySelectorAll("[data-tab-panel]")];
  const activate = (index) => {
    tabs.forEach((tab, itemIndex) => tab.setAttribute("aria-selected", String(itemIndex === index)));
    panels.forEach((panel, itemIndex) => { panel.hidden = itemIndex !== index; });
  };
  tabs.forEach((tab, index) => tab.addEventListener("click", () => activate(index)));
  activate(0);
})();
`.trim();

const quoteCss = `
.attributed-quote { display: grid; grid-template-columns: 5rem 1fr; gap: 1rem; align-items: start; margin: 1.5rem 0; }
.attributed-quote__image { border-radius: 999px; height: 5rem; object-fit: cover; width: 5rem; }
.attributed-quote blockquote { margin: 0 0 .5rem; }
.attributed-quote cite { font-style: normal; font-weight: 700; }
`.trim();

const carouselCss = `
.article-carousel { margin: 1.5rem 0; position: relative; }
.article-carousel__slide[hidden] { display: none; }
.article-carousel__slide img { display: block; height: auto; width: 100%; }
.article-carousel__controls { display: flex; justify-content: space-between; margin-top: .5rem; }
`.trim();

const carouselScript = `
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
`.trim();

function source(strings: TemplateStringsArray, ...values: string[]): string {
  return String.raw({ raw: strings }, ...values).trim();
}

export const BUILTIN_COMPONENTS: readonly ComponentDefinitionInput[] = [
  {
    source: source`
const TABS_CSS = ${JSON.stringify(tabsCss)};
const TABS_SCRIPT = ${JSON.stringify(tabsScript)};
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
      <style>{TABS_CSS}</style>
      <div className="article-tabs">
        <div className="article-tabs__list" role="tablist">
          {tabs.map((tab, index) => (
            <button className="article-tabs__tab" type="button" role="tab" data-tab-index={index}>
              {tab.label}
            </button>
          ))}
        </div>
        {tabs.map((tab, index) => (
          <div className="article-tabs__panel" role="tabpanel" data-tab-panel={index}>
            {tab.content}
          </div>
        ))}
      </div>
      <script>{TABS_SCRIPT}</script>
    </>
  );
}
`,
  },
  {
    source: source`
const QUOTE_CSS = ${JSON.stringify(quoteCss)};

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
    <>
      <style>{QUOTE_CSS}</style>
      <figure className="attributed-quote">
        <img className="attributed-quote__image" src={image} alt={imageAlt} />
        <figcaption>
          <blockquote>{quote}</blockquote>
          <cite>{author}</cite>
        </figcaption>
      </figure>
    </>
  );
}
`,
  },
  {
    source: source`
const CAROUSEL_CSS = ${JSON.stringify(carouselCss)};
const CAROUSEL_SCRIPT = ${JSON.stringify(carouselScript)};
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
      <style>{CAROUSEL_CSS}</style>
      <div className="article-carousel">
        <div className="article-carousel__slides">
          {images.map((image, index) => (
            <figure className="article-carousel__slide" data-carousel-slide={index}>
              <img src={image.src} alt={image.alt} />
              <figcaption>{image.caption}</figcaption>
            </figure>
          ))}
        </div>
        <div className="article-carousel__controls">
          <button type="button" data-carousel-previous>Previous</button>
          <button type="button" data-carousel-next>Next</button>
        </div>
      </div>
      <script>{CAROUSEL_SCRIPT}</script>
    </>
  );
}
`,
  },
] as const;
