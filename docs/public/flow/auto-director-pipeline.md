# AI Director Pipeline

The AI director is a resumable production pipeline, not a five-step wizard. The
short overview of direction, world, characters, planning, and execution hides
smaller checkpointed stages that are visible in Task Center and Director
Follow-ups.

<!-- DIRECTOR_PROGRESS_ITEM_KEYS: candidate_seed_alignment,candidate_project_framing,candidate_direction_batch,candidate_title_pack,novel_create,book_contract,story_macro,constraint_engine,world_setup,character_setup,character_cast_apply,volume_strategy,volume_skeleton,beat_sheet,chapter_list,chapter_sync,chapter_detail_bundle -->

## Run modes

| Mode | Best for | Stops or continues at |
| --- | --- | --- |
| Prepare until ready to write | First books and plan review | Creates the book and all preparation assets, then stops before prose |
| Complete the book automatically | Hands-off production | Continues through writing, review, repair, and state feedback |
| Run a selected range | Validating a smaller scope | Runs the selected book, volume, or chapter range |
| Review and repair after writing | A stronger quality loop | Adds detection, review, and repair after each chapter |

Modes change approval boundaries and execution range; they do not create a
second stage order or a second chapter runtime.

## Safe pauses

Automatic production pauses when the provider is unavailable, quota is
exhausted, review requests a replan, repairs repeatedly fail, or structural
and data-safety checks fail. The task preserves the checkpoint and exposes a
recovery action. After the external problem is fixed, continue from that point.

## Stage sequence

1. Align the premise and project framing.
2. Generate direction and title candidates.
3. Create the novel after direction confirmation.
4. Establish the book contract and story macro plan.
5. Prepare constraints, world, and core characters.
6. Apply the character cast.
7. Build volume strategy and skeleton.
8. Generate the beat sheet, chapter list, and chapter synchronization.
9. Create chapter detail bundles and reach the chapter-batch-ready checkpoint.
10. Hand the selected range to the shared chapter runtime.

The task projection exposes progress and the active action without making the UI
reconstruct state from unrelated caches. The director may ask the user to
confirm a candidate, fix missing information, choose a model, or accept a
recovery action.

## Approval and recovery

Automatic approval is allowed only where the stage contract says the result is
safe to continue. Candidate directions, high-risk character proposals, and
structural replan decisions remain visible to the user. A local chapter issue
becomes repair work or quality debt; it is not automatically promoted to a
global replan.
