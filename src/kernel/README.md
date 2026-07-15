# Kernel

Protocol-agnostic durable primitives: canonical identity, verified
content-addressed objects, receipt chains, and common errors. This module has no Pi,
workflow, session, proposal, or HITL concepts. Protocol code should normally consume
these primitives through `src/sdk`.
