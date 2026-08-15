# Use restricted Component data syntax

Component References retain an immutable Component ID and a restricted object literal internally, with `html` template literals for rich HTML values. User- and model-facing Article Source resolves that identity to an import-free, name-derived Component Tag such as `<SimpleTabs />`. This keeps identity stable across renames while presenting familiar HTML-like syntax; reference data is parsed as inert data and never executed as JavaScript.
