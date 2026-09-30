import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";

export default function LanguageToggle() {
  const { locale, toggleLocale, t } = useI18n();
  const nextLabel = locale === "en-US" ? t("language.switchToChinese") : t("language.switchToEnglish");

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="gap-1.5 px-2"
      onClick={toggleLocale}
      aria-label={nextLabel}
      title={nextLabel}
    >
      <Languages className="h-4 w-4" aria-hidden="true" />
      <span className="text-xs font-medium">{locale === "en-US" ? "中" : "EN"}</span>
    </Button>
  );
}
