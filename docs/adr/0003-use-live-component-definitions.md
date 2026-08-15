# Use live Component definitions without versions

Component Types are unique unversioned names, and every Managed Block compiles with its Component's current definition. This keeps authoring and Component discovery simple; editing a Component updates all managed references, while detaching a block freezes its generated HTML for independent customization. Deleting a Component first materializes its current generated HTML into every referencing Article Source so no article is left broken.
