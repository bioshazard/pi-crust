# pi-crust

Pi-native, durable Pocock v1.1 workflow POC. Stock Pi loads the project-local
extension at `.pi/extensions/crust.ts`; SQLite and `.crust/objects` hold workflow
authority and immutable evidence.

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
