# Store production-ready Article Image bytes in the database

Article Images store website-normalized bytes and original source metadata in the relational database, rather than relying on the Builder's chat-upload filesystem or CMS storage. RBCCM images are stored as WebP. CMWeb images are stored as JPEG, except PNGs remain PNG until the user chooses the one-click JPEG conversion. This keeps Preview and publishing on the same bytes while the CMS file is unavailable; a future object-store adapter may replace the storage mechanism if database size becomes costly.
