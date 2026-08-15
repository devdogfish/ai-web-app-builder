# Use restricted Component data syntax

Component References contain a Component Type and a restricted object literal, with `html` template literals for rich HTML values. This keeps each reference self-contained and LLM-readable without forcing HTML attributes and markup through JSON string escaping; the syntax is parsed as inert data and never executed as JavaScript.
