import type { OverrideEditor, ParagraphConfig } from "platejs";
import { ParagraphPlugin } from "platejs/react";
import { fragmentToPlainText, normalizeEditorText, toPlateValue } from "../chapterEditorUtils";

// A manuscript has one plain-text newline representation, including Shift+Enter.
const withManuscriptParagraphs: OverrideEditor<ParagraphConfig> = ({ editor, tf: { insertText, insertFragment } }) => ({
  transforms: {
    insertSoftBreak() {
      editor.tf.insertBreak();
    },
    insertText(value, options) {
      const text = normalizeEditorText(value);
      if (text.includes("\n")) {
        editor.tf.insertFragment(toPlateValue(text), options);
      } else {
        insertText(text, options);
      }
    },
    insertFragment(fragment, options) {
      // This editor owns plain prose, so pasted soft lines use the same blocks.
      insertFragment(toPlateValue(fragmentToPlainText(fragment, (node) => editor.api.isBlock(node))), options);
    },
  },
});

export const ManuscriptParagraphPlugin = ParagraphPlugin.overrideEditor(withManuscriptParagraphs);
