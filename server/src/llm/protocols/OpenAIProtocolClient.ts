import {
  ChatOpenAI,
  ChatOpenAICompletions,
  ChatOpenAIResponses,
  type ChatOpenAIFields,
  type OpenAIClient,
  type OpenAICoreRequestOptions,
} from "@langchain/openai";
import {
  getOpenAICompatibleBaseUrlCandidates,
  isOpenAIEndpointNotFoundError,
} from "../openAICompatibleEndpoints";
import type { OpenAIRequestProtocol } from "./requestProtocol";
import { isLlmRequestBudgetExhausted } from "../requestBudget";
import {
  normalizeResponsesApiResponse,
  normalizeResponsesApiStream,
} from "./responsesCompatibility";

function stopRetriesOnExhaustedBudget(model: ChatOpenAI | ChatOpenAIResponses | ChatOpenAICompletions): void {
  // Preserve LangChain's default status/cancellation policy while adding one
  // terminal failure. The SDK wraps fetch errors in APIConnectionError.cause.
  const caller = model.caller as unknown as {
    onFailedAttempt?: (error: unknown) => unknown;
  };
  const onFailedAttempt = caller.onFailedAttempt;
  caller.onFailedAttempt = (error) => {
    if (isLlmRequestBudgetExhausted(error)) throw error;
    return onFailedAttempt?.call(caller, error);
  };
}

class CompatibleChatOpenAIResponses extends ChatOpenAIResponses {
  private readonly endpointFallback: ChatOpenAIResponses | null;
  private endpointFallbackSelected = false;

  constructor(fields: ChatOpenAIFields) {
    super(fields);
    stopRetriesOnExhaustedBudget(this);
    const baseURL = fields.configuration?.baseURL;
    const fallbackBaseURL = typeof baseURL === "string"
      ? getOpenAICompatibleBaseUrlCandidates(baseURL)[1]
      : undefined;
    this.endpointFallback = fallbackBaseURL
      ? new ChatOpenAIResponses({
        ...fields,
        configuration: {
          ...fields.configuration,
          baseURL: fallbackBaseURL,
        },
      })
      : null;
    if (this.endpointFallback) stopRetriesOnExhaustedBudget(this.endpointFallback);
  }

  override completionWithRetry(
    request: OpenAIClient.Responses.ResponseCreateParamsStreaming,
    requestOptions?: OpenAICoreRequestOptions,
  ): Promise<AsyncIterable<OpenAIClient.Responses.ResponseStreamEvent>>;
  override completionWithRetry(
    request: OpenAIClient.Responses.ResponseCreateParamsNonStreaming,
    requestOptions?: OpenAICoreRequestOptions,
  ): Promise<OpenAIClient.Responses.Response>;
  override async completionWithRetry(
    request:
      | OpenAIClient.Responses.ResponseCreateParamsStreaming
      | OpenAIClient.Responses.ResponseCreateParamsNonStreaming,
    requestOptions?: OpenAICoreRequestOptions,
  ): Promise<
    | AsyncIterable<OpenAIClient.Responses.ResponseStreamEvent>
    | OpenAIClient.Responses.Response
  > {
    if (request.stream) {
      const response = await this.createStreamingResponse(request, requestOptions);
      return normalizeResponsesApiStream(
        response,
      ) as AsyncIterable<OpenAIClient.Responses.ResponseStreamEvent>;
    }
    const response = await this.createResponse(request, requestOptions);
    return normalizeResponsesApiResponse(response);
  }

  private async createStreamingResponse(
    request: OpenAIClient.Responses.ResponseCreateParamsStreaming,
    requestOptions?: OpenAICoreRequestOptions,
  ): Promise<AsyncIterable<OpenAIClient.Responses.ResponseStreamEvent>> {
    if (this.endpointFallbackSelected && this.endpointFallback) {
      return this.endpointFallback.completionWithRetry(request, requestOptions);
    }
    try {
      return await super.completionWithRetry(request, requestOptions);
    } catch (error) {
      if (!this.endpointFallback || !isOpenAIEndpointNotFoundError(error)) {
        throw error;
      }
      const response = await this.endpointFallback.completionWithRetry(request, requestOptions);
      this.endpointFallbackSelected = true;
      return response;
    }
  }

  private async createResponse(
    request: OpenAIClient.Responses.ResponseCreateParamsNonStreaming,
    requestOptions?: OpenAICoreRequestOptions,
  ): Promise<OpenAIClient.Responses.Response> {
    if (this.endpointFallbackSelected && this.endpointFallback) {
      return this.endpointFallback.completionWithRetry(request, requestOptions);
    }
    try {
      return await super.completionWithRetry(request, requestOptions);
    } catch (error) {
      if (!this.endpointFallback || !isOpenAIEndpointNotFoundError(error)) {
        throw error;
      }
      const response = await this.endpointFallback.completionWithRetry(request, requestOptions);
      this.endpointFallbackSelected = true;
      return response;
    }
  }
}

class CompatibleChatOpenAICompletions extends ChatOpenAICompletions {
  private readonly endpointFallback: ChatOpenAICompletions | null;
  private endpointFallbackSelected = false;

  constructor(fields: ChatOpenAIFields) {
    super(fields);
    stopRetriesOnExhaustedBudget(this);
    const baseURL = fields.configuration?.baseURL;
    const fallbackBaseURL = typeof baseURL === "string"
      ? getOpenAICompatibleBaseUrlCandidates(baseURL)[1]
      : undefined;
    this.endpointFallback = fallbackBaseURL
      ? new ChatOpenAICompletions({
        ...fields,
        configuration: {
          ...fields.configuration,
          baseURL: fallbackBaseURL,
        },
      })
      : null;
    if (this.endpointFallback) stopRetriesOnExhaustedBudget(this.endpointFallback);
  }

  override completionWithRetry(
    request: OpenAIClient.Chat.ChatCompletionCreateParamsStreaming,
    requestOptions?: OpenAICoreRequestOptions,
  ): Promise<AsyncIterable<OpenAIClient.Chat.Completions.ChatCompletionChunk>>;
  override completionWithRetry(
    request: OpenAIClient.Chat.ChatCompletionCreateParamsNonStreaming,
    requestOptions?: OpenAICoreRequestOptions,
  ): Promise<OpenAIClient.Chat.Completions.ChatCompletion>;
  override async completionWithRetry(
    request:
      | OpenAIClient.Chat.ChatCompletionCreateParamsStreaming
      | OpenAIClient.Chat.ChatCompletionCreateParamsNonStreaming,
    requestOptions?: OpenAICoreRequestOptions,
  ): Promise<
    | AsyncIterable<OpenAIClient.Chat.Completions.ChatCompletionChunk>
    | OpenAIClient.Chat.Completions.ChatCompletion
  > {
    if (this.endpointFallbackSelected && this.endpointFallback) {
      return request.stream
        ? this.endpointFallback.completionWithRetry(request, requestOptions)
        : this.endpointFallback.completionWithRetry(request, requestOptions);
    }
    try {
      return request.stream
        ? await super.completionWithRetry(request, requestOptions)
        : await super.completionWithRetry(request, requestOptions);
    } catch (error) {
      if (!this.endpointFallback || !isOpenAIEndpointNotFoundError(error)) {
        throw error;
      }
      const response = request.stream
        ? await this.endpointFallback.completionWithRetry(request, requestOptions)
        : await this.endpointFallback.completionWithRetry(request, requestOptions);
      this.endpointFallbackSelected = true;
      return response;
    }
  }
}

class ProtocolBoundChatOpenAI extends ChatOpenAI {
  private readonly boundRequestProtocol: OpenAIRequestProtocol;

  constructor(fields: ChatOpenAIFields, requestProtocol: OpenAIRequestProtocol) {
    const responsesFields = {
      ...fields,
      ...(requestProtocol === "openai_responses" ? { zdrEnabled: true } : {}),
    };
    super({
      ...responsesFields,
      useResponsesApi: requestProtocol === "openai_responses",
      ...(requestProtocol === "openai_responses"
        ? { responses: new CompatibleChatOpenAIResponses(responsesFields) }
        : { completions: new CompatibleChatOpenAICompletions(responsesFields) }),
    });
    this.boundRequestProtocol = requestProtocol;
    stopRetriesOnExhaustedBudget(this);
  }

  protected override _useResponsesApi(
    _options: this["ParsedCallOptions"] | undefined,
  ): boolean {
    return this.boundRequestProtocol === "openai_responses";
  }
}

export function createOpenAIProtocolClient(
  fields: ChatOpenAIFields,
  requestProtocol: OpenAIRequestProtocol,
): ChatOpenAI {
  return new ProtocolBoundChatOpenAI(fields, requestProtocol);
}
