# pwbot headless example

`pwbot` consumes normalized Slack-thread events. It never calls Slack directly.
It returns a delivery package that an adapter may post after durable completion.

```text
Slack adapter → PwbotInput → deterministic karma → optional fresh Pi run
              ← delivery package + artifacts + receipt chain
```

Message events project the bounded thread into a fresh, tool-free Pi SDK session.
The assistant's natural stop is observed; only a non-empty normal stop produces a
delivery package. Configured reaction events update karma and terminate without an
LLM call. Event IDs make both paths idempotent.

`<@user> ++ comment` and `<@user> -- comment` are parsed from the triggering
message only. Reaction value is selected from the machine's locked
`reactionValues` policy; the event cannot choose its own score. Replaying an event
under changed policy/composition is rejected.

The Slack adapter owns authentication, mention/DM filtering, thread retrieval, and
delivery. It should acknowledge input only after `handle()` returns durable state,
then deduplicate outbound delivery using `delivery.correlation.inputId`.
