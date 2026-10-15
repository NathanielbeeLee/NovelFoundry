# Manual chapter review evidence

The explicit chapter review/audit endpoints use `audit.chapter.manual_evidence`.
Automatic chapter acceptance and production audits retain their own contracts.
One AI call judges literary quality and counterevidence; host checks only ground
quotes in the exact reviewed text. Invalid, ambiguous, missing or unsupported
findings stay visible as advice and cannot become automatic repair inputs.

Complete findings, including keep/defer decisions, are preserved in existing
report JSON. Only grounded confirmed findings create ordinary audit issue rows.
Report persistence conditionally locks the original chapter content in the same
transaction; a stale manuscript cannot receive a new saved report. An explicit
unsaved revision is reviewed as a preview without replacing saved audit rows.
No regex or keyword rule decides prose quality. AI failures remain errors.

Repair checks source hash and exact quotation again. Legacy reports remain
readable and are never labelled as evidence-verified. Existing automatic
production and user-authored repair instructions keep their current behavior.
Local review issues remain chapter guidance, never an implicit global replan.
