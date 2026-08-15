# Treat all Component Source as untrusted

Any user may create Components without a separate authorization role, so Component Source must never compile or execute with the Builder server's authority. Compilation and rendering run inside a resource-bounded isolation boundary without filesystem, network, environment-variable, or import access; Component Source is one self-contained TSX file with only local helpers. Authentication and authorization are not used as substitutes for isolation.
