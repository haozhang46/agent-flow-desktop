import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const invokeMock = vi.fn();

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: vi.fn().mockImplementation(() => ({
    invoke: invokeMock,
  })),
}));

import {
  createCompleteJson,
  createDeepSeekChatModel,
  createLlmGenerateRunner,
  parseLlmJsonContent,
  stripMarkdownFences,
} from "../../electron/ua/llmComplete";
import { ChatOpenAI } from "@langchain/openai";

describe("stripMarkdownFences / parseLlmJsonContent", () => {
  it("strips fenced json blocks", () => {
    expect(stripMarkdownFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripMarkdownFences('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("parses plain JSON strings and objects", () => {
    expect(parseLlmJsonContent('{"ok":true}')).toEqual({ ok: true });
    expect(parseLlmJsonContent({ already: "object" })).toEqual({
      already: "object",
    });
    expect(parseLlmJsonContent('```json\n{"x":2}\n```')).toEqual({ x: 2 });
  });
});

describe("createCompleteJson", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    vi.mocked(ChatOpenAI).mockClear();
  });

  it("throws when API key is missing", async () => {
    const completeJson = createCompleteJson(() => null);
    await expect(completeJson("sys", "user")).rejects.toThrow("API key not set");
    expect(ChatOpenAI).not.toHaveBeenCalled();
  });

  it("invokes non-streaming DeepSeek ChatOpenAI and returns parsed JSON", async () => {
    invokeMock.mockResolvedValue({ content: '{"nodes":[]}' });
    const completeJson = createCompleteJson(() => "sk-test");
    const result = await completeJson("system prompt", "user prompt");

    expect(result).toEqual({ nodes: [] });
    expect(ChatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "deepseek-v4-pro",
        apiKey: "sk-test",
        streaming: false,
        configuration: { baseURL: "https://api.deepseek.com/v1" },
      }),
    );
    expect(invokeMock).toHaveBeenCalledTimes(1);
    const messages = invokeMock.mock.calls[0][0];
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe("system prompt");
    expect(messages[1].content).toBe("user prompt");
  });

  it("strips markdown fences from model content", async () => {
    invokeMock.mockResolvedValue({
      content: '```json\n{"draft":true}\n```',
    });
    const completeJson = createCompleteJson(() => "sk-test");
    await expect(completeJson("s", "u")).resolves.toEqual({ draft: true });
  });
});

describe("createDeepSeekChatModel", () => {
  beforeEach(() => {
    vi.mocked(ChatOpenAI).mockClear();
  });

  it("uses deepseek-v4-pro and deepseek base URL", () => {
    createDeepSeekChatModel("key");
    expect(ChatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "deepseek-v4-pro",
        streaming: false,
        configuration: { baseURL: "https://api.deepseek.com/v1" },
      }),
    );
  });
});

describe("createLlmGenerateRunner", () => {
  afterEach(() => {
    invokeMock.mockReset();
  });

  it("loads generate-workflow-from-graph skill and returns parsed draft", async () => {
    let capturedSystem = "";
    let capturedUser = "";
    const runner = createLlmGenerateRunner({
      getApiKey: () => "sk-test",
      completeJson: async (system, user) => {
        capturedSystem = system;
        capturedUser = user;
        return {
          workflow: { id: "demo" },
          prompts: {},
          meta: { source: "ua-graph" },
        };
      },
    });

    const result = await runner({
      summaryMarkdown: "# Summary",
      curatedMarkdown: "## Curated",
      goal: "Ship it",
    });

    expect(capturedSystem).toContain("Generate Workflow from Graph");
    expect(capturedUser).toContain("Ship it");
    expect(capturedUser).toContain("# Summary");
    expect(capturedUser).toContain("## Curated");
    expect(result).toEqual({
      workflow: { id: "demo" },
      prompts: {},
      meta: { source: "ua-graph" },
    });
  });

  it("strips fenced string responses from completeJson", async () => {
    const runner = createLlmGenerateRunner({
      getApiKey: () => "sk-test",
      completeJson: async () => '```json\n{"ok":1}\n```',
    });
    await expect(
      runner({
        summaryMarkdown: "s",
        curatedMarkdown: "c",
        goal: null,
      }),
    ).resolves.toEqual({ ok: 1 });
  });

  it("throws when API key is not set", async () => {
    const runner = createLlmGenerateRunner({
      getApiKey: () => null,
      completeJson: async () => ({}),
    });
    await expect(
      runner({
        summaryMarkdown: "s",
        curatedMarkdown: "c",
        goal: null,
      }),
    ).rejects.toThrow("API key not set");
  });
});
