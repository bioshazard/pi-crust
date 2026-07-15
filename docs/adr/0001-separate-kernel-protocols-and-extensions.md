---
status: accepted
---

# Separate the kernel, protocols, and extensions

Crust keeps proven durable primitives in a small kernel, offers an opinionated SDK
for using them consistently, places workflow meaning in protocol clients, and
delivers execution and interaction through extensions. This prevents Pocock's
Pi-TUI/HITL implementation from becoming kernel ontology while allowing repeated
needs across protocols to reveal later kernel abstractions.

## Decision

The kernel currently owns canonical identity, verified content-addressed objects,
hash-chained receipts, and common errors. It contains no Pi dependency, protocol
state, session concept, proposal, ticket, human interaction, or generic workflow
abstraction.

The SDK is the supported interface for protocol implementations. It consistently
roots artifact storage, creates receipt journals, computes composition/projection
identity, and supplies optional execution helpers such as the Pi natural-stop
adapter. The SDK is intentionally opinionated convenience over the kernel, not the
kernel itself.

A protocol client owns domain states, projections, terminal conditions, legal
transitions, evaluation requirements, decision meaning, and presentation data.
Pocock and pwbot are protocol clients with intentionally different control
shapes; they need not share a universal workflow interface.

A Crust extension connects protocol execution or interaction through the SDK.
The Pi natural-stop executor is one such helper. Pocock's current HITL behavior
remains inside its protocol-specific Pi extension. A future generic HITL extension
may expose TUI, Slack, CLI, or web adapters after a second HITL protocol proves the
shared decision-request interface. A Crust extension may itself be packaged as a
Pi extension; the two uses of “extension” are not the same architectural role.

The likely shape is:

```text
Crust kernel primitives
        ↓
Opinionated Crust SDK
├── Pi natural-stop execution helper
├── Pocock protocol + Pocock-specific Pi/HITL extension
└── pwbot protocol + external Slack adapter

Later, if earned:
└── HITL decision extension
    ├── Pi-TUI adapter
    ├── Slack adapter
    └── CLI/web adapter
```

## Consequences

- Headless protocols do not acquire HITL concepts merely because Pocock needs them.
- `operator()`, Pi session binding, ticket state, review axes, and proposal
  presentation remain local to Pocock.
- Protocols own their present SQLite schemas, revision transactions, and domain
  validation. Those mechanisms differ materially between Pocock and pwbot; they
  move inward only when repeated use reveals a deep kernel interface.
- We will not extract a universal HITL extension from Pocock alone. A second HITL
  protocol must demonstrate the shared decision-request interface first.
- We will prefer shared durable primitives over a generic workflow DSL or universal
  state-machine abstraction.
