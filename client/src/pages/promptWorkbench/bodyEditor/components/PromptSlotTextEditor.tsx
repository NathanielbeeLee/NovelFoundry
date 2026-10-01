import { useCallback, useEffect, useState } from "react";
import { ParagraphPlugin, Plate, PlateContent, usePlateEditor } from "platejs/react";
import { cn } from "@/lib/utils";
import { toPlateValue, toPlainText, normalizeValuePayload } from "../domain/plateText";

export function PromptSlotTextEditor(props: {
  value: string;
  maxLength?: number;
  placeholder?: string;
  minHeightClassName?: string;
  immersive?: boolean;
  disabled?: boolean;
  onChange: (next: string) => void;
}) {
  const {
    disabled,
    immersive,
    maxLength,
    minHeightClassName = "min-h-[150px]",
    onChange,
    placeholder,
    value,
  } = props;
  const [editorSeed, setEditorSeed] = useState(0);
  const [internalText, setInternalText] = useState(value);

  const editor = usePlateEditor(
    {
      plugins: [ParagraphPlugin],
      value: toPlateValue(internalText),
    },
    [editorSeed],
  );

  useEffect(() => {
    if (value === internalText) {
      return;
    }
    setInternalText(value);
    setEditorSeed((current) => current + 1);
  }, [internalText, value]);

  const handleValueChange = useCallback((payload: unknown) => {
    const nextText = toPlainText(normalizeValuePayload(payload));
    const normalized = maxLength ? nextText.slice(0, maxLength) : nextText;
    if (normalized === internalText) {
      return;
    }
    setInternalText(normalized);
    if (normalized !== nextText) {
      setEditorSeed((current) => current + 1);
    }
    onChange(normalized);
  }, [internalText, maxLength, onChange]);

  const lineCount = Math.max(1, internalText.replace(/\r\n/g, "\n").split("\n").length);
  const remaining = typeof maxLength === "number" ? maxLength - internalText.length : null;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border bg-white shadow-[0_10px_28px_rgba(15,55,48,0.08)]",
        immersive ? "border-[#a9cfc4]" : "border-[#cbdad6]",
      )}
    >
      <div className="flex min-h-0">
        <div className="w-12 shrink-0 select-none border-r border-[#dce8e4] bg-[#eef7f3] py-3 pr-2 text-right font-mono text-[11px] leading-6 text-[#6f8d86]">
          {Array.from({ length: lineCount }).map((_, index) => (
            <div key={index}>{index + 1}</div>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          {editor ? (
            <Plate editor={editor} onValueChange={handleValueChange}>
              <PlateContent
                readOnly={disabled}
                placeholder={placeholder}
                className={cn(
                  "prose prose-sm max-w-none rounded-r-md px-4 py-4 text-sm leading-7 outline-none dark:prose-invert",
                  "break-words [&_p]:m-0 [&_p]:min-h-6 [&_p]:text-foreground",
                  disabled && "cursor-not-allowed opacity-70",
                  minHeightClassName,
                )}
              />
            </Plate>
          ) : null}
        </div>
      </div>
      {remaining !== null ? (
        <div className="border-t border-[#dce8e4] bg-[#fbfdfb] px-3 py-1.5 text-right text-xs text-[#6f7f78]">
          {remaining < 0 ? <span className="text-destructive">{remaining}</span> : remaining} 字剩余
        </div>
      ) : null}
    </div>
  );
}
