import { useState } from "react";
import { Users } from "lucide-react";
import type { ComicCharacter } from "@/api/comic";
import { CharacterList } from "./CharacterList";
import { CharacterDetail } from "./CharacterDetail";
import { FactsSection } from "./FactsSection";

export function CharactersPanel({
  project,
  provider,
}: {
  project: { id: string; characters: ComicCharacter[] };
  provider: string;
}) {
  const [selectedCharacterId, setSelectedCharacterId] = useState(project.characters[0]?.id ?? "");

  if (project.characters.length === 0) {
    return (
      <div className="space-y-2 py-12 text-center text-sm text-muted-foreground">
        <Users className="mx-auto h-10 w-10 opacity-30" />
        <p>暂无角色。</p>
        <p className="text-xs">导入内容源后，角色会自动提取到这里。</p>
      </div>
    );
  }

  const selectedCharacter =
    project.characters.find((character) => character.id === selectedCharacterId) ?? project.characters[0];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <CharacterList
          characters={project.characters}
          selectedCharacterId={selectedCharacter.id}
          onSelect={setSelectedCharacterId}
        />
        <CharacterDetail key={selectedCharacter.id} character={selectedCharacter} provider={provider} />
      </div>
      <div className="rounded-lg border bg-background">
        <FactsSection projectId={project.id} />
      </div>
    </div>
  );
}
