# Pin Managed Blocks to recipe versions

Each Managed Block records a versioned Recipe Key and continues compiling with that exact Block Recipe until an editor explicitly upgrades it. This prevents Component Library changes from silently altering existing Articles, while requiring deliberate migrations when recipes improve.
