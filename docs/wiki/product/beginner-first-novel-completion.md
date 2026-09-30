# Beginner-First Novel Completion

## Background

The primary user is a writing beginner who may not know how to design a full
outline, character arc, pacing plan, or recovery strategy. The product must
help the user finish a book instead of handing every structural decision back
to them.

## Decision

Product, UX, prompt, agent, and runtime decisions prioritize lower cognitive
load, strong defaults, and one clear next action. AI owns planning, judgment,
scheduling, execution, continuity checks, and repair guidance. Deterministic
code owns validation, permissions, idempotency, safety, persistence, and
post-processing of structured output.

## Current rules

- Every primary page explains the current stage, the next action, why it is
  recommended, and what scope a risk affects.
- First-run setup confirms a usable normal and structured-output model before
  allowing AI writes.
- The onboarding journey reads real provider, director, novel, and chapter
  state. Browser storage may remember dismissed help, but cannot fabricate
  milestones.
- The first-novel milestone ends at a readable first chapter with review and
  continuity state. It does not force a beginner to understand every module or
  wait for the whole book.
- Preparation is progressive: prepare only the world, cast, and chapter context
  needed for the next useful step, then expand assets as the book grows.
- Advanced routing, knowledge, style, image, and world controls remain
  available but cannot block the first chapter.
- Candidate directions and alternate routes remain proposals until explicitly
  confirmed. They must not write canon or long-term facts automatically.
- Local quality debt is visible and repairable. It does not stop the global
  director chain unless the structured decision requests a replan or a safety
  failure leaves no usable content.
- UI copy describes the user's action and result. It does not narrate internal
  migrations or implementation history.

## Review questions

Before adding a new workflow, ask whether it helps a beginner reach a readable
chapter, reduces a real decision burden, or improves recoverability. If it adds
another state machine, prompt path, or required form without improving that
outcome, keep it out of the main path.
