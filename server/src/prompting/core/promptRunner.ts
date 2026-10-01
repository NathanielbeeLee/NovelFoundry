import * as execution from "./execution";

// Writable compatibility exports preserve callers' existing CommonJS test seams.
export const preparePromptExecution = execution.preparePromptExecution;
export type { PreparedStructuredPromptExecution } from "./execution";
export const prepareStructuredPromptExecution = execution.prepareStructuredPromptExecution;
export const runPreparedStructuredPrompt = execution.runPreparedStructuredPrompt;
export const runStructuredPrompt = execution.runStructuredPrompt;
export const streamStructuredPrompt = execution.streamStructuredPrompt;
export const runTextPrompt = execution.runTextPrompt;
export const streamTextPrompt = execution.streamTextPrompt;
export const setPromptRunnerLLMFactoryForTests = execution.setPromptRunnerLLMFactoryForTests;
export const setPromptRunnerStructuredInvokerForTests = execution.setPromptRunnerStructuredInvokerForTests;
