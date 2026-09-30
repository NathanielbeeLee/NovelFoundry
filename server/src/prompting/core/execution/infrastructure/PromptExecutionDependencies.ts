import { getLLM } from "../../../../llm/factory";
import { invokeStructuredLlmDetailed } from "../../../../llm/structuredInvoke";

export type PromptRunnerLLMFactory = typeof getLLM;

export type PromptRunnerStructuredInvoker = typeof invokeStructuredLlmDetailed;

export let promptRunnerLLMFactory: PromptRunnerLLMFactory = getLLM;

export let promptRunnerStructuredInvoker: PromptRunnerStructuredInvoker = invokeStructuredLlmDetailed;

export function setPromptRunnerLLMFactoryForTests(factory?: PromptRunnerLLMFactory): void {
  promptRunnerLLMFactory = factory ?? getLLM;
}

export function setPromptRunnerStructuredInvokerForTests(invoker?: PromptRunnerStructuredInvoker): void {
  promptRunnerStructuredInvoker = invoker ?? invokeStructuredLlmDetailed;
}
