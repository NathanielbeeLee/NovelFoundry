import { Router } from "express";
import type { ApiResponse } from "@novelfoundry/shared/types/api";
import { z } from "zod";
import { filterHiddenModels, parseHiddenModels, refreshProviderModelsWithFallback } from "../../../../llm/modelCatalog";
import { getProviderEnvApiKey, getProviderEnvBaseUrl, getProviderEnvModel, isBuiltInProvider, providerRequiresApiKey, PROVIDERS, SUPPORTED_PROVIDERS } from "../../../../llm/providers";
import { AppError } from "../../../../middleware/errorHandler";
import { validate } from "../../../../middleware/validate";
import { providerBalanceService } from "../../ProviderBalanceService";
import { secretStore } from "../../secretStore";
import { getProviderImageModelMap } from "../../ProviderImageSettingsService";
import { providerSchema, upsertApiKeySchema } from "../domain/ProviderSettingsPolicy";
import { buildBuiltInProviderStatus, buildCustomProviderStatus, normalizeOptionalText, normalizeProviderAuthMode, saveProviderSettings } from "../application/ProviderSettingsService";

import { beginProviderDiscovery, readProviderDiscovery } from "../infrastructure/ProviderDiscoveryStore";
import { resolveProviderDiscovery } from "../application/ProviderDiscoveryService";

export function registerProviderSettingsRoutes(router: Router): void {
  router.get("/api-keys", async (_req, res, next) => {
    try {
      const keys = await secretStore.listProviders();
      const keyMap = new Map(keys.map((item) => [item.provider, item]));
      const allProviders = Array.from(new Set([
        ...SUPPORTED_PROVIDERS,
        ...keys.map((item) => item.provider),
      ]));
      const imageModelMap = await getProviderImageModelMap(allProviders);
      const builtInProviders = SUPPORTED_PROVIDERS.map((provider) =>
        buildBuiltInProviderStatus(provider, keyMap.get(provider), imageModelMap.get(provider)),
      );
      const customProviders = await Promise.all(keys
        .filter((item) => !isBuiltInProvider(item.provider))
        .map(async (item) => buildCustomProviderStatus(item, imageModelMap.get(item.provider), await readProviderDiscovery(item))));
      const data = [...builtInProviders, ...customProviders];
      res.status(200).json({
        success: true,
        data,
        message: "厂商配置已加载。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.get("/api-keys/balances", async (_req, res, next) => {
    try {
      const keys = await secretStore.listProviders({ providers: SUPPORTED_PROVIDERS });
      const keyMap = new Map(
        SUPPORTED_PROVIDERS.map((provider) => {
          const record = keys.find((item) => item.provider === provider);
          return [provider, normalizeOptionalText(record?.key) ?? getProviderEnvApiKey(provider)] as const;
        }),
      );
      const data = await providerBalanceService.listBalances(keyMap);
      res.status(200).json({
        success: true,
        data,
        message: "Loaded provider balances.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.put(
    "/api-keys/:provider",
    validate({ params: providerSchema, body: upsertApiKeySchema }),
    async (req, res, next) => {
      try {
        const { provider } = req.params as z.infer<typeof providerSchema>;
        res.status(200).json(await saveProviderSettings(provider, req.body));
      } catch (error) { next(error); }
    },
  );

  router.post(
    "/api-keys/:provider/refresh-balance",
    validate({ params: providerSchema }),
    async (req, res, next) => {
      try {
        const { provider } = req.params as z.infer<typeof providerSchema>;
        if (!isBuiltInProvider(provider)) {
          throw new AppError("自定义厂商暂不支持刷新余额。", 400);
        }
        const keyConfig = await secretStore.getProvider(provider);
        const data = await providerBalanceService.getProviderBalance({
          provider,
          apiKey: normalizeOptionalText(keyConfig?.key) ?? getProviderEnvApiKey(provider),
        });
        res.status(200).json({
          success: true,
          data,
          message: data.status === "available" ? "Refreshed provider balance." : data.message,
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/api-keys/:provider/refresh-models",
    validate({ params: providerSchema }),
    async (req, res, next) => {
      try {
        const { provider } = req.params as z.infer<typeof providerSchema>;
        const keyConfig = await secretStore.getProvider(provider);
        const effectiveKey = normalizeOptionalText(keyConfig?.key) ?? getProviderEnvApiKey(provider);
        if (providerRequiresApiKey(provider) && !effectiveKey) {
          throw new AppError("请先配置 API Key，再刷新模型列表。", 400);
        }
        const custom = !isBuiltInProvider(provider);
        if (custom && !keyConfig) throw new AppError("没有找到这个自定义厂商。", 404);
        let discovery = custom && keyConfig ? await readProviderDiscovery(keyConfig) : null;
        const requestStartedAt = beginProviderDiscovery();
        const hiddenModels = parseHiddenModels(keyConfig?.hiddenModels);
        const currentModel = normalizeOptionalText(keyConfig?.model)
          ?? getProviderEnvModel(provider)
          ?? (isBuiltInProvider(provider) ? PROVIDERS[provider].defaultModel : "");
        const refreshResult = await refreshProviderModelsWithFallback(
          provider, effectiveKey,
          normalizeOptionalText(keyConfig?.baseURL) ?? getProviderEnvBaseUrl(provider),
          [...(discovery?.models ?? []), currentModel], normalizeProviderAuthMode(keyConfig?.authMode),
        );
        if (custom && keyConfig) {
          discovery = await resolveProviderDiscovery(keyConfig, requestStartedAt,
            refreshResult.catalogAvailable ? refreshResult.models : undefined);
        }
        const models = filterHiddenModels([
          ...(custom ? discovery?.models ?? [] : refreshResult.models), currentModel,
        ], hiddenModels, currentModel);
        res.status(200).json({
          success: true,
          data: {
            provider,
            models,
            currentModel,
            modelsDiscoveredAt: discovery?.discoveredAt ?? null,
          },
          message: refreshResult.catalogAvailable ? "模型列表已刷新。" : "厂商未提供模型列表接口，已保留历史列表和手动填写的模型。",
        } satisfies ApiResponse<{
          provider: string;
          models: string[];
          currentModel: string;
          modelsDiscoveredAt: string | null;
        }>);
      } catch (error) {
        if (error instanceof Error && /failed|empty|失败|为空|未提供/i.test(error.message)) {
          next(new AppError(error.message, 400));
          return;
        }
        next(error);
      }
    },
  );

}
