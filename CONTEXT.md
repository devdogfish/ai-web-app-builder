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
An Article Block whose declared data is rendered through a locked Component. Its generated markup and behavior cannot be edited directly.
_Avoid_: Locked component, live component

**Component**:
A reusable definition authored as React/JSX and rendered by the Builder into self-contained ordinary HTML. It contains its exact shell and any required inline styling or behavior.
_Avoid_: Recipe, HTML template

**Component Author**:
A person who supplies a Component's React/JSX source and identifies its editable Component Props. Any user may be a Component Author; they do not separately define schemas or UI hints.
_Avoid_: Schema author, contract author

**Article Editor**:
A person who edits an Article and its Managed Blocks through generated controls. They edit Component Prop values, never Component Source or its internal data contract.
_Avoid_: Component Author, schema editor

**Component Source**:
The self-contained, single-file React/TSX representation edited by a Component Author and compiled only inside the Builder. It may define local helpers but has no imports; React is not included in Article HTML.
_Avoid_: HTML blob, Component HTML

**Component Name**:
The mutable, human-readable label shown for a Component. Its PascalCase form is the Component Tag; it is independent of the exported React function name.
_Avoid_: Component Tag, function name

**Component Description**:
Mutable author-supplied guidance describing when a Component should be used. It is stored as Component metadata rather than inferred from source after creation.
_Avoid_: Source documentation

**Component Behavior**:
Optional browser logic authored within Component Source and emitted directly into Article HTML as self-contained inline JavaScript. It has no external runtime or script dependency.
_Avoid_: React runtime, external script

**Component Prop**:
A named editable input declared through the Component Source's TypeScript props. Component Props collectively determine the generated visual instance editor.
_Avoid_: Placeholder, template variable

**Component Default**:
An optional initial value declared for a Component Prop within Component Source. It pre-fills new Managed Blocks; a Component Author need not provide it.
_Avoid_: Default-data JSON, sample data

**Component Data Schema**:
The internal typed definition and editing hints derived deterministically from Component Source's TypeScript props. It validates Managed Block data and generates the visual instance editor but is never authored separately.
_Avoid_: Props form, component inputs

**Component Tag**:
The mutable, human-facing PascalCase form of a Component Name, such as `SimpleTabs`. Active Component Tags are unique and change whenever their Component Name changes.
_Avoid_: Component ID, Component Name, Component Type, function name

**Component ID**:
The immutable internal primary key selecting a Component. Managed references use this identity, so changing a Component Name or Tag never changes what they resolve to.
_Avoid_: Component Type, Component Name

**Component Reference**:
A Managed Block reference whose immutable Component ID and restricted data object remain internal. Article Editors and Component Authors see its current Component Tag as an import-free self-closing element such as `<SimpleTabs />`; rich HTML values use unescaped `html` template literals rather than JSON strings.
_Avoid_: Component Directive, JSX component

**Detached Block**:
A former Managed Block whose generated snippet has been inserted as ordinary, freely editable Article Source HTML, either explicitly or when its Component is deleted. Article chat may inspect and modify it, but it no longer receives Component changes.
_Avoid_: Ejected component, custom component

**Article Image**:
An image owned by an Article and held at an explicit position in the Article's canonical ordered image collection. Its position determines its eventual production filename.
_Avoid_: Chat upload, reference upload, attachment

**Needs Upload**:
A marker on an Article Image whose database content or position is newer than its production file and requires upload again. Preview displays the database image while this marker is set. An Article needs image upload whenever any of its Article Images carries this marker.
_Avoid_: Stale, unpublished

**Production Image**:
The CMS-hosted file corresponding to an Article Image. Its filename is derived from the Article Image's current position.
_Avoid_: Remote source, uploaded attachment
