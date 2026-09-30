import { useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { formatCommercialTagsInput, type NovelBasicFormState } from "../../novelBasicInfo.shared";
import { suggestBookFraming } from "@/api/novelFraming";
import AiButton from "@/components/common/AiButton";
import { toast } from "@/components/ui/toast";
import { useLLMStore } from "@/store/llmStore";
import { useI18n } from "@/i18n";

interface GenreOption {
  id: string;
  label: string;
  path: string;
}

interface BookFramingQuickFillButtonProps {
  basicForm: NovelBasicFormState;
  genreOptions: GenreOption[];
  onApplySuggestion: (patch: Partial<NovelBasicFormState>) => void;
  descriptionOverride?: string;
}

function hasExistingFramingContent(basicForm: NovelBasicFormState): boolean {
  return Boolean(
    basicForm.targetAudience.trim()
    || basicForm.commercialTagsText.trim()
    || basicForm.competingFeel.trim()
    || basicForm.bookSellingPoint.trim()
    || basicForm.first30ChapterPromise.trim(),
  );
}

export function BookFramingQuickFillButton(props: BookFramingQuickFillButtonProps) {
  const { t } = useI18n();
  const { basicForm, genreOptions, onApplySuggestion, descriptionOverride } = props;
  const llm = useLLMStore();
  const effectiveDescription = basicForm.description.trim() || descriptionOverride?.trim() || "";
  const selectedGenreLabel = useMemo(
    () => genreOptions.find((item) => item.id === basicForm.genreId)?.path
      ?? genreOptions.find((item) => item.id === basicForm.genreId)?.label
      ?? "",
    [basicForm.genreId, genreOptions],
  );

  const suggestionMutation = useMutation({
    mutationFn: () => suggestBookFraming({
      title: basicForm.title.trim() || undefined,
      description: effectiveDescription || undefined,
      genreLabel: selectedGenreLabel || undefined,
      styleTone: basicForm.styleTone.trim() || undefined,
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
    }),
    onSuccess: (response) => {
      const suggestion = response.data;
      if (!suggestion) {
        toast.error(t("directorSetup.quickFillNoSuggestion"));
        return;
      }
      onApplySuggestion({
        targetAudience: suggestion.targetAudience,
        commercialTagsText: formatCommercialTagsInput(suggestion.commercialTags),
        competingFeel: suggestion.competingFeel,
        bookSellingPoint: suggestion.bookSellingPoint,
        first30ChapterPromise: suggestion.first30ChapterPromise,
      });
      toast.success(t("directorSetup.quickFillSuccess"));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("directorSetup.quickFillError"));
    },
  });

  const handleGenerate = () => {
    if (!basicForm.title.trim() && !effectiveDescription) {
      toast.error(t("directorSetup.quickFillEmpty"));
      return;
    }
    if (hasExistingFramingContent(basicForm)) {
      const confirmed = window.confirm(t("directorSetup.quickFillConfirm"));
      if (!confirmed) {
        return;
      }
    }
    suggestionMutation.mutate();
  };

  return (
    <AiButton
      type="button"
      variant="outline"
      size="sm"
      onClick={handleGenerate}
      disabled={suggestionMutation.isPending}
    >
      {suggestionMutation.isPending ? t("directorSetup.quickFillPending") : t("directorSetup.quickFill")}
    </AiButton>
  );
}
