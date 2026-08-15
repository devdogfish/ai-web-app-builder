# Article Creation

The article creation context covers an article's editorial content and the media prepared for its eventual publication.

## Language

**Article**:
The editorial item that owns its content and ordered image collection across the creation, building, and publishing steps.
_Avoid_: Article item, article row

**Article HTML**:
The single HTML payload handed to the CMS for an Article. It may include inline scripts and styles needed by that Article.
_Avoid_: HTML file, page component

**Article Source**:
The Builder's editable representation of an Article. It combines ordinary HTML with references to Managed Blocks and compiles into Article HTML.
_Avoid_: Article HTML, JSX

**Article Block**:
A semantically distinct Article region, such as an attributed quote, tabs, or an image carousel, whose intended form may be inferred from an unmarked source document.
_Avoid_: Component, custom HTML structure

**Block Recognition**:
The classification of source-document content as an Article Block. High-confidence recognition may be applied automatically; uncertain recognition requires editorial confirmation.
_Avoid_: Component detection, layout guessing

**Managed Block**:
An Article Block whose declared content properties are rendered through a locked, versioned recipe. Its generated markup and behavior cannot be edited directly.
_Avoid_: Locked component, live component

**Block Recipe**:
A reusable definition that renders one self-contained HTML snippet from validated properties. The snippet contains its exact shell and any required inline styling or behavior.
_Avoid_: Component, template

**Property Schema**:
The typed definition and editing hints for a Block Recipe's variable content. It validates Managed Block data and generates the default visual instance editor.
_Avoid_: Props form, component inputs

**Recipe Key**:
The stable, versioned name selecting a Block Recipe, such as `tabs@2`. A Managed Block remains pinned to its selected Recipe Key until explicitly upgraded.
_Avoid_: Component ID, component name

**Component Directive**:
A self-closing Article Source element containing exactly a Recipe Key and the JSON properties for one Managed Block.
_Avoid_: JSX component, custom tag

**Detached Block**:
An Article Block converted to freely editable Article HTML after explicit editorial confirmation. It no longer receives recipe guarantees or upgrades.
_Avoid_: Ejected component, custom component

**Article Image**:
An image owned by an Article and held at an explicit position in the Article's canonical ordered image collection. Its position determines its eventual production filename.
_Avoid_: Chat upload, reference upload, attachment

**Needs Upload**:
A marker on an Article Image whose content or position requires its production file to be uploaded again. An Article needs image upload whenever any of its Article Images carries this marker; the marker does not determine which image Preview displays.
_Avoid_: Stale, unpublished

**Production Image**:
The CMS-hosted file corresponding to an Article Image. Its filename is derived from the Article Image's current position.
_Avoid_: Remote source, uploaded attachment
