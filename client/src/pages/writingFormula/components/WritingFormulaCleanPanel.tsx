import type { StyleDetectionReport, StyleProfile, StyleRewriteResult } from "@novelfoundry/shared/types/styleEngine";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StyleRewritePreview } from "@/features/styleRewritePreview";

interface WritingFormulaCleanPanelProps {
  selectedProfile: StyleProfile | null;
  detectInput: string;
  detectionReport: StyleDetectionReport | null;
  detectionPending: boolean;
  rewritePending: boolean;
  rewritePreview: StyleRewriteResult | null;
  onDetectInputChange: (value: string) => void;
  onDetect: () => void;
  onRewrite: () => void;
}

export default function WritingFormulaCleanPanel(props: WritingFormulaCleanPanelProps) {
  const {
    selectedProfile,
    detectInput,
    detectionReport,
    detectionPending,
    rewritePending,
    rewritePreview,
    onDetectInputChange,
    onDetect,
    onRewrite,
  } = props;

  const antiAiRuleNames = selectedProfile?.antiAiRules.map((rule) => rule.name) ?? [];
  const busy = detectionPending || rewritePending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>去 AI 味</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {selectedProfile ? (
          <div className="rounded-2xl border bg-slate-50/70 px-4 py-3 text-sm leading-7 text-slate-700">
            按「{selectedProfile.name}」这套写法检测正文，生成候选修订稿，并核对剧情信息是否保留。
          </div>
        ) : (
          <div className="rounded-2xl border bg-slate-50/70 px-4 py-3 text-sm leading-7 text-slate-700">
            先从列表里选中一套写法，再来检测正文。
          </div>
        )}

        <div className="space-y-4 rounded-2xl border p-4">
          <div className="space-y-1">
            <div className="text-base font-semibold text-slate-950">当前会优先参考的反 AI 约束</div>
            <div className="text-sm leading-6 text-slate-500">
              如果这套写法绑了反 AI 规则，检测和修正会优先按这些约束去判断问题。
            </div>
          </div>
          {antiAiRuleNames.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {antiAiRuleNames.map((ruleName) => (
                <div key={`${selectedProfile?.id}-${ruleName}`} className="rounded-full border bg-slate-50 px-3 py-1 text-sm text-slate-700">
                  {ruleName}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed px-3 py-3 text-sm leading-6 text-slate-500">
              这套写法还没有绑定明确的反 AI 规则。当前检测会更依赖通用风险判断，结果可能不够贴合你的预期。
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-2xl border p-4">
          <div className="space-y-1">
            <div className="text-base font-semibold text-slate-950">检测正文</div>
            <div className="text-sm leading-6 text-slate-500">
              粘贴你想检查的正文。建议一次给一段完整场景，这样更容易看出叙述腔、对白腔和解释腔的问题。
            </div>
          </div>

          <textarea
            data-writing-formula-detect-input
            autoFocus
            className="min-h-[220px] w-full rounded-md border p-3 text-sm"
            placeholder="粘贴待检测正文"
            value={detectInput}
            onChange={(event) => onDetectInputChange(event.target.value)}
          />

          <div className="flex flex-wrap gap-2">
            <Button onClick={onDetect} disabled={busy || !selectedProfile || !detectInput.trim()}>
              {detectionPending ? "检测中..." : "执行检测"}
            </Button>
            <Button variant="secondary" onClick={onRewrite} disabled={busy || !selectedProfile || !detectInput.trim()}>
              {rewritePending ? "修文与保真检查中..." : "生成修订稿并检查"}
            </Button>
          </div>

          {detectionReport ? (
            <div className="space-y-3 rounded-2xl border p-4 text-sm">
              <div className="space-y-1">
                <div className="font-medium text-slate-900">原文规则检测</div>
                <div className="text-slate-900">原文 AI 味风险分：{detectionReport.riskScore}</div>
                <div className="leading-6 text-slate-600">{detectionReport.summary}</div>
                <div className="text-xs text-slate-500">此结果来自原文，不代表修订稿的文风质量。</div>
              </div>
              <div className="space-y-2">
                {detectionReport.violations.map((item, index) => (
                  <div key={`${item.ruleId}-${index}`} className="rounded-xl border p-3">
                    <div className="font-medium text-slate-900">{item.ruleName}</div>
                    <div className="mt-1 text-xs leading-6 text-slate-500">{item.reason}</div>
                    <div className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                      {item.excerpt}
                    </div>
                  </div>
                ))}
                {detectionReport.violations.length === 0 ? (
                  <div className="rounded-xl border border-dashed px-3 py-3 text-sm leading-6 text-slate-500">原文没有命中需要修文的规则。</div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed px-3 py-3 text-sm leading-6 text-slate-500">
              检测结果会在这里显示，重点告诉你哪些句段最像 AI 腔、为什么会被判成风险，以及可以往什么方向改。
            </div>
          )}

          {rewritePreview ? (
            <StyleRewritePreview result={rewritePreview} />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
