import { User } from "lucide-react";
import { characterSheetImageUrl, type ComicCharacter } from "@/api/comic";
import { parseSheetData, getExpressionData } from "../domain/characterPresentation";

export function CharacterList({
  characters,
  selectedCharacterId,
  onSelect,
}: {
  characters: ComicCharacter[];
  selectedCharacterId: string;
  onSelect: (characterId: string) => void;
}) {
  return (
    <aside className="overflow-hidden rounded-lg border bg-background">
      <div className="border-b px-3 py-3">
        <p className="text-sm font-semibold">角色列表</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{characters.length} 个角色</p>
      </div>
      <div className="max-h-[720px] overflow-y-auto p-2">
        <div className="space-y-1">
          {characters.map((character) => {
            const sheetData = parseSheetData(character);
            const expressionData = getExpressionData(sheetData);
            const isSelected = character.id === selectedCharacterId;
            const hasSheet = sheetData.status === "done";

            return (
              <button
                key={character.id}
                type="button"
                className={[
                  "group w-full rounded-md border px-3 py-2 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isSelected ? "border-primary bg-primary/10" : "border-transparent hover:border-border hover:bg-muted/60",
                ].join(" ")}
                onClick={() => onSelect(character.id)}
              >
                <div className="flex items-start gap-2">
                  <div
                    className={[
                      "relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border",
                      isSelected ? "border-primary/30 bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                    ].join(" ")}
                  >
                    <User className="h-4 w-4" />
                    {hasSheet && (
                      <img
                        src={characterSheetImageUrl(character.id)}
                        alt={`${character.name} 头像`}
                        className="absolute inset-0 h-full w-full object-cover object-left"
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{character.name}</p>
                      {hasSheet && (
                        <span className="shrink-0 text-[10px] text-muted-foreground">v{sheetData.version ?? 1}</span>
                      )}
                    </div>
                    {character.persona && (
                      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {character.persona}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className={hasSheet ? "text-primary" : ""}>三视图</span>
                      <span className="text-border">/</span>
                      <span className={expressionData.status === "done" ? "text-primary" : ""}>表情稿</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
