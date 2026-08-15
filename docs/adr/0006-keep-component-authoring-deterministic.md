# Keep Component authoring deterministic

Component creation and editing must not use AI to infer variables, field types, repetition, or other behavior. Component Authors need failures and saved results to be predictable because one plausible but incorrect interpretation can silently break every Managed Block using that Component; authoring therefore uses explicit input and deterministic derivation even when AI could reduce visible setup.
