import type { ComponentDefinitionInput } from "./contracts";

export const BUILTIN_COMPONENTS: readonly ComponentDefinitionInput[] = [
  {
    type: "tabs",
    description: "Interactive labeled tabs, each containing custom rich HTML.",
    htmlTemplate: `<style>
.article-tabs { border: 1px solid #d8d8d8; border-radius: 8px; overflow: hidden; }
.article-tabs__list { display: flex; gap: 0; border-bottom: 1px solid #d8d8d8; }
.article-tabs__tab { appearance: none; border: 0; background: #f5f5f5; cursor: pointer; padding: .75rem 1rem; }
.article-tabs__tab[aria-selected="true"] { background: #fff; font-weight: 700; }
.article-tabs__panel { padding: 1rem; }
</style>
<div class="article-tabs">
  <div class="article-tabs__list" role="tablist">
    {{#each tabs}}<button class="article-tabs__tab" type="button" role="tab" data-tab-index="{{@index}}">{{label}}</button>{{/each}}
  </div>
  {{#each tabs}}<div class="article-tabs__panel" role="tabpanel" data-tab-panel="{{@index}}">{{{content}}}</div>{{/each}}
</div>
<script>
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
</script>`,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        tabs: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              label: { type: "string", minLength: 1, maxLength: 120 },
              content: { type: "html", minLength: 1 },
            },
            required: ["label", "content"],
          },
        },
      },
      required: ["tabs"],
    },
    uiHints: {
      tabs: { label: "Tabs", control: "list", order: 1 },
      "tabs[]": { label: "Tab", control: "group" },
      "tabs[].label": { label: "Label", control: "text", order: 1 },
      "tabs[].content": { label: "Content", control: "rich-html", order: 2 },
    },
    defaultData: {
      tabs: [
        { label: "First tab", content: "<p>First tab content.</p>" },
        { label: "Second tab", content: "<p>Second tab content.</p>" },
      ],
    },
    sampleData: {
      tabs: [
        { label: "Overview", content: '<p>Content with a <a href="/details">normal attribute</a>.</p>' },
        { label: "Details", content: "<p>More details.</p>" },
      ],
    },
  },
  {
    type: "attributed-quote",
    description: "A rich quotation with author byline and portrait image.",
    htmlTemplate: `<style>
.attributed-quote { display: grid; grid-template-columns: 5rem 1fr; gap: 1rem; align-items: start; margin: 1.5rem 0; }
.attributed-quote__image { border-radius: 999px; height: 5rem; object-fit: cover; width: 5rem; }
.attributed-quote blockquote { margin: 0 0 .5rem; }
.attributed-quote cite { font-style: normal; font-weight: 700; }
</style>
<figure class="attributed-quote">
  <img class="attributed-quote__image" src="{{image}}" alt="{{imageAlt}}">
  <figcaption><blockquote>{{{quote}}}</blockquote><cite>{{author}}</cite></figcaption>
</figure>`,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        quote: { type: "html", minLength: 1 },
        author: { type: "string", minLength: 1, maxLength: 200 },
        image: { type: "image" },
        imageAlt: { type: "string", maxLength: 300 },
      },
      required: ["quote", "author", "image", "imageAlt"],
    },
    uiHints: {
      quote: { label: "Quote", control: "rich-html", order: 1 },
      author: { label: "Author", control: "text", order: 2 },
      image: { label: "Portrait", control: "image", order: 3 },
      imageAlt: { label: "Portrait alt text", control: "text", order: 4 },
    },
    defaultData: {
      quote: "<p>Add the quotation.</p>",
      author: "Author name",
      image: "/images/author.jpg",
      imageAlt: "Portrait of the author",
    },
    sampleData: {
      quote: "<p>Markets reward patience.</p>",
      author: "Jane Doe",
      image: "/images/jane-doe.jpg",
      imageAlt: "Jane Doe",
    },
  },
  {
    type: "image-carousel",
    description: "Interactive previous/next carousel for images with rich captions.",
    htmlTemplate: `<style>
.article-carousel { margin: 1.5rem 0; position: relative; }
.article-carousel__slide[hidden] { display: none; }
.article-carousel__slide img { display: block; height: auto; width: 100%; }
.article-carousel__controls { display: flex; justify-content: space-between; margin-top: .5rem; }
</style>
<div class="article-carousel">
  <div class="article-carousel__slides">
    {{#each images}}<figure class="article-carousel__slide" data-carousel-slide="{{@index}}"><img src="{{src}}" alt="{{alt}}"><figcaption>{{{caption}}}</figcaption></figure>{{/each}}
  </div>
  <div class="article-carousel__controls"><button type="button" data-carousel-previous>Previous</button><button type="button" data-carousel-next>Next</button></div>
</div>
<script>
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
</script>`,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        images: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              src: { type: "image" },
              alt: { type: "string", maxLength: 300 },
              caption: { type: "html" },
            },
            required: ["src", "alt", "caption"],
          },
        },
      },
      required: ["images"],
    },
    uiHints: {
      images: { label: "Images", control: "list", order: 1 },
      "images[]": { label: "Image", control: "group" },
      "images[].src": { label: "Image", control: "image", order: 1 },
      "images[].alt": { label: "Alt text", control: "text", order: 2 },
      "images[].caption": { label: "Caption", control: "rich-html", order: 3 },
    },
    defaultData: {
      images: [{ src: "/images/slide.jpg", alt: "", caption: "<p>Add a caption.</p>" }],
    },
    sampleData: {
      images: [
        { src: "/images/one.jpg", alt: "First image", caption: "<p>First image caption.</p>" },
        { src: "/images/two.jpg", alt: "Second image", caption: "<p>Second image caption.</p>" },
      ],
    },
  },
] as const;
