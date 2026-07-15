# pi-crust

Durable agent-control experiments over a small Crust kernel and its opinionated
helper SDK.

```text
src/kernel  proven low-level mechanisms; no Pi or protocol dependency
src/sdk     supported helper interface for consistent kernel use
src/eg      opinionated protocols and their adapters
```

The kernel currently provides canonical identity, verified content-addressed
objects, receipt chains, and common errors. The SDK roots those mechanisms for a
run store and supplies the optional Pi natural-stop adapter. Protocols retain their
own state machines and transactional schemas until repetition earns a deeper shared
interface.

Crust now has two deliberately different example clients:

- `src/eg/pocock`: interactive Pi-TUI workflow; terminal proposals require a human decision.
- `src/eg/pwbot`: headless Slack-thread workflow; a fresh Pi SDK run ends naturally and emits a delivery package. Configured karma reactions terminate without invoking Pi.

They consume the SDK but do not share a universal workflow interface. Pocock owns
its TUI/HITL behavior; pwbot uses natural-stop execution only when deterministic
handling is insufficient.

```sh
npm install
npm run skills:install
npm test
pi --no-extensions --no-skills --no-prompt-templates --no-context-files \
  --no-builtin-tools --extension .pi/extensions/crust.ts
```

Inside Pi, use `/crust start <idea>`, `/crust status`, `/crust evidence`, and
`/crust next [ticket]`. Proposal tools open the operator decision popup and advance
automatically. `/crust accept` and `/crust reject` remain recovery commands. Only
the active state's proposal tool is exposed to the model.
Crust also activates a locked builtin-tool allowlist and bounded `stage_artifact` tool.

Run `npm run test:live` for the opt-in stock-Pi/OAuth exercise; default tests remain model-free.

Link the development CLI once, then launch Crust from any target folder:

```sh
npm link
cd /path/to/target
crust .
```

The launcher installs the pinned project-local skills when needed, then runs isolated
Pi with workflow state stored under the target's `.crust/` directory. Its private lock
does not replace the target's existing skills setup.

Proposal dialogs show a deterministic summary and can open the full immutable payload
and artifacts before acceptance. Tickets retain their work contract and acceptance
criteria; each fresh ticket session receives resolved specification and ticket content.
Review runs isolated read-only Standards and Specification agents in parallel before a
review proposal becomes legal.

Without linking, use `npm run crust -- /path/to/target` from this checkout.

## Headless pwbot example

The pwbot machine accepts normalized input rather than Slack credentials:

```ts
const bot = createPwbotMachine({
  root: ".crust",
  agent: createPiNaturalStopAgent(),
  reactionValues: { tada: 0.1 },
});

const result = await bot.handle(slackThreadInput);
if (result.delivery) await slack.post(result.delivery);
```

The outer Slack adapter authenticates events, retrieves thread contents, resolves a
reaction's message author, and delivers completed packages. `eventId` provides
idempotency. Karma directives such as `<@U123> ++ helpful review` and configured
emoji reactions update SQLite deterministically; only message replies invoke the LLM.
Karma-only messages terminate without invoking Pi.
