# Article Images integration

The domain module provides feature seams for the host application's existing
Article workflow. The standalone Builder uses the same repository through its
own Article Images dialog.

## Builder

Images selected or dropped into Builder Chat are routed to Article Images, not
Reference Upload attachments. Each batch is converted with the active website
policy, appended in production order, and opens the manager dialog. Non-image
files in the same selection remain Reference Uploads.

The header image stack reopens the dialog. Reordering submits the complete ID
order to `ArticleImageRepository.reorder`; removing uses `remove`. The dialog
renders `needsUpload`, production paths, and database previews from the returned
workspace rather than predicting those values in client state.

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

Use `RemoteFirstImage` where a host surface explicitly needs to inspect the
published CMS result with a database fallback.

Builder DOCX bootstrap uses a same-origin Preview proxy. The rendered copy maps
each production path to that proxy without changing Article Source. When
`needsUpload` is set, the proxy returns the newer database bytes immediately.
Otherwise it requests the configured CMS asset first and returns the stored
database bytes when the CMS request fails or does not return an image. Preview
URLs include image and Article Version revisions to force a fresh request.

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
