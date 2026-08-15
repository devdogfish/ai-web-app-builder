# Article Images integration

This module is intentionally not mounted in the standalone Builder. It provides
the new feature seams for the host application's existing Article workflow.

## Step 1: Article form

Render `ArticleImageManager` as a controlled field. Convert selected `File`
objects to `NewArticleImage` values on the server, call
`ArticleImageRepository.add`, then return refreshed `ArticleImageManagerItem`
props. Supply the database preview URL and derived production filename because
routing, authorization, and website naming policy belong to the host app.

The manager submits a complete ordered ID list. Pass it directly to
`ArticleImageRepository.reorder`. The repository marks only images whose dense
numeric positions changed as `needsUpload`.

## Preview

Use `RemoteFirstImage` where the host preview renders an Article Image. It tries
the production URL and switches to the supplied authenticated database URL only
after an image load error. `needsUpload` never changes this choice.

Builder DOCX bootstrap performs the same behavior inside its sandboxed Preview:
it extracts embedded images in document order, converts them using the selected
website policy, stores the converted bytes, and injects a production-path to
database-URL fallback map into the rendered preview document.

For the database endpoint, authenticate and authorize access to the Article,
call `getBinary(articleId, imageId)`, then return `articleImageResponse(image)`.
The helper deliberately performs no authorization itself.

## Step 3: publishing

Call `listNeedingUpload(articleId)`, derive each production path with the host's
existing naming policy, and pass the bytes to an `ArticleImageCmsUploader`.
After each confirmed CMS upload, call `markUploaded(articleId, [imageId])`.
Retries, partial failures, CMS credentials, and remote deletion remain host-owned.

The Builder host must send images through
`builder/environment/production-images.ts` before calling the CMS transport.
That boundary converts RBCCM images to WebP and enforces CMWeb's JPEG/PNG rule.

## Persistence

`article_images` belongs to `articles` by foreign key. It stores production-ready
bytes, original filename, stored media type, size, dense position, and `needs_upload`. Migration
`0004_superb_eternity.sql` and local bootstrap DDL create the table.
