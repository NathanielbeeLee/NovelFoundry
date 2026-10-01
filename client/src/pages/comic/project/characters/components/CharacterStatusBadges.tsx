import type { CharacterExpressionData, CharacterSheetData } from "@/api/comic";
import { Badge } from "@/components/ui/badge";

export function CharacterStatusBadges({
  sheetData,
  expressionData,
}: {
  sheetData: CharacterSheetData;
  expressionData: CharacterExpressionData;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={sheetData.status === "done" ? "default" : "secondary"} className="text-[11px]">
        三视图{sheetData.status === "done" ? ` v${sheetData.version ?? 1}` : "待生成"}
      </Badge>
      <Badge variant={expressionData.status === "done" ? "default" : "secondary"} className="text-[11px]">
        表情稿{expressionData.status === "done" ? ` v${expressionData.version ?? 1}` : "待生成"}
      </Badge>
    </div>
  );
}
