# pwbot headless example

`pwbot` is an executable Socket Mode Slack bot over the Crust SDK and Pi SDK.
Bolt supplies authenticated Slack ingress/egress; the transport-neutral adapter
projects Slack events into the durable machine and posts completed delivery packages.

```text
Slack adapter → PwbotInput → deterministic karma → optional fresh Pi run
              ← delivery package + artifacts + receipt chain
```

Message events project the bounded thread into a fresh, tool-free Pi SDK session.
The assistant's natural stop is observed; only a non-empty normal stop produces a
delivery package. Configured reaction events update karma and terminate without an
LLM call. Event IDs make both paths idempotent.

`<@user> ++ comment` and `<@user> -- comment` are parsed from the triggering
message only and terminate without an LLM when they comprise the whole message.
Reaction value is selected from the machine's locked
`reactionValues` policy; the event cannot choose its own score. Replaying an event
under changed policy/composition is rejected.

## Configure Slack

Create or update the Slack app from `slack-manifest.json`, install it to the
workspace, and place its credentials in `.env.dev` beside this README:

```dotenv
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
OPENAI_API_KEY=...
OPENAI_API_MODEL=gpt-4o
OPENAI_API_BASE=https://api.openai.com/v1
```

`.env.dev` is ignored. Existing Pi credentials also work when the OpenAI variables
are omitted. Optional overrides:

```dotenv
PWBOT_STATE_DIR=.crust
PWBOT_REACTION_VALUES={"thumbsup":0.1,"tada":0.1}
PWBOT_PI_PROVIDER=openai
PWBOT_PI_MODEL=gpt-4o
PWBOT_PI_THINKING=medium
```

## Run

Install once at the repository root, then start from this directory:

```sh
cd ../../..
npm install
cd src/eg/pwbot
npm start
```

Or from the repository root:

```sh
npm run pwbot
npm run pwbot -- --env-file /absolute/path/to/.env.dev
```

State and immutable reply artifacts live under `PWBOT_STATE_DIR` (default
`.crust/` in this directory). Ctrl-C stops the Socket Mode connection.

The Slack adapter handles mentions, DMs, thread retrieval, reactions, and delivery.
Inbound event IDs deduplicate machine effects. Outbound Slack posting is currently
at-least-once across a crash between posting and recording transport completion.
