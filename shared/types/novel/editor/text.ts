/** Editor text uses LF; saved-source CAS values must never pass through this. */
export function normalizeChapterEditorText(text: string | null | undefined): string {
  return (text ?? "").replace(/\r\n/g, "\n");
}

export interface ChapterEditorTextParagraph {
  index: number;
  text: string;
  from: number;
  to: number;
}

/** One LF separates editor blocks, including empty and trailing blocks. */
export function splitChapterEditorParagraphs(text: string | null | undefined): ChapterEditorTextParagraph[] {
  let cursor = 0;
  return normalizeChapterEditorText(text).split("\n").map((paragraph, index) => {
    const from = cursor;
    const to = from + paragraph.length;
    cursor = to + 1;
    return { index: index + 1, text: paragraph, from, to };
  });
}

/** Ranges are UTF-16 and half-open, just like String.slice and editor offsets. */
export function findChapterEditorParagraphRange(
  text: string,
  range: { from: number; to: number },
): { startIndex: number; endIndex: number } | null {
  const normalized = normalizeChapterEditorText(text);
  if (!Number.isInteger(range.from) || !Number.isInteger(range.to)
    || range.from < 0 || range.to <= range.from || range.to > normalized.length) return null;
  const paragraphs = splitChapterEditorParagraphs(normalized);
  const startIndex = paragraphs.findIndex((paragraph) => range.from <= paragraph.to);
  const endIndex = paragraphs.findIndex((paragraph) => range.to - 1 <= paragraph.to);
  return startIndex < 0 || endIndex < 0 ? null : { startIndex, endIndex };
}

export function chapterEditorParagraphWindow(text: string, range: { from: number; to: number }) {
  const indices = findChapterEditorParagraphRange(text, range);
  if (!indices) return { beforeParagraphs: [], afterParagraphs: [] };
  const paragraphs = splitChapterEditorParagraphs(text);
  return {
    beforeParagraphs: paragraphs.slice(Math.max(0, indices.startIndex - 3), indices.startIndex).map((paragraph) => paragraph.text),
    afterParagraphs: paragraphs.slice(indices.endIndex + 1, indices.endIndex + 3).map((paragraph) => paragraph.text),
  };
}
