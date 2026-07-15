import { expect, it } from "vitest";
import { pwbotConfig } from "../src/eg/pwbot/config.js";

it("maps Slack and legacy OpenAI environment into executable pwbot configuration", () => {
  expect(pwbotConfig({
    SLACK_BOT_TOKEN: "xoxb-test",
    SLACK_APP_TOKEN: "xapp-test",
    OPENAI_API_KEY: "sk-test",
    OPENAI_API_BASE: "https://models.example/v1",
    OPENAI_API_MODEL: "gpt-4o",
    PWBOT_LOG_LEVEL: "debug",
    PWBOT_REACTION_VALUES: '{"tada":0.1,"heart":0.2}',
    PWBOT_STATE_DIR: "/tmp/pwbot-state",
  })).toEqual({
    slack: { botToken: "xoxb-test", appToken: "xapp-test", logLevel: "debug" },
    stateRoot: "/tmp/pwbot-state",
    reactions: { tada: 0.1, heart: 0.2 },
    pi: {
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-test",
      baseUrl: "https://models.example/v1",
    },
  });
});

it("fails closed when Slack credentials are absent", () => {
  expect(() => pwbotConfig({})).toThrow(/SLACK_BOT_TOKEN/);
});

it("fails closed on an invalid log level", () => {
  expect(() => pwbotConfig({
    SLACK_BOT_TOKEN: "xoxb-test",
    SLACK_APP_TOKEN: "xapp-test",
    PWBOT_LOG_LEVEL: "verbose",
  })).toThrow(/PWBOT_LOG_LEVEL/);
});
