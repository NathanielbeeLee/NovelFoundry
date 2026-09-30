import type { Response, Router } from "express";
import { z } from "zod";
import { streamToSSE } from "../../../../llm/streaming";
import { validate } from "../../../../middleware/validate";
import type { ChapterRuntimeCoordinator } from "../../../../services/novel/runtime/ChapterRuntimeCoordinator";
import { chapterRuntimeRequestSchema } from "../../../../services/novel/runtime/chapterRuntimeSchema";
import { stepModuleRunner } from "../../../../services/novel/director/workflowStepRuntime/StepModuleRunner";
import { DIRECTOR_EXECUTION_STEP_IDS } from "../../../../services/novel/director/workflowStepRuntime/directorWorkflowStepIds";

type ChapterStreamResult = Awaited<ReturnType<ChapterRuntimeCoordinator["createChapterStream"]>>;

interface RegisterNovelChapterGenerationRoutesInput {
  router: Router;
  chapterParamsSchema: z.ZodType<{
    id: string;
    chapterId: string;
  }>;
  forwardBusinessError: (error: unknown, next: (err?: unknown) => void) => boolean;
}

function watchChapterConnection(res: Response) {
  const controller = new AbortController();
  const onClose = () => {
    if (res.writableEnded) return;
    const error = new Error("章节生成连接已关闭。");
    error.name = "AbortError";
    controller.abort(error);
  };
  res.once("close", onClose);
  if (res.destroyed) onClose();
  return { signal: controller.signal, dispose: () => res.removeListener("close", onClose) };
}

export function registerNovelChapterGenerationRoutes(input: RegisterNovelChapterGenerationRoutesInput): void {
  const {
    router,
    chapterParamsSchema,
    forwardBusinessError,
  } = input;

  router.post(
    "/:id/chapters/:chapterId/runtime/run",
    validate({ params: chapterParamsSchema, body: chapterRuntimeRequestSchema }),
    async (req, res, next) => {
      const connection = watchChapterConnection(res);
      try {
        connection.signal.throwIfAborted();
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        const { stream, onDone } = await stepModuleRunner.runStep<ChapterStreamResult>(
          DIRECTOR_EXECUTION_STEP_IDS.chapter_execution,
          {
            novelId: id,
            mode: "manual",
            targetType: "chapter",
            targetChapterId: chapterId,
            stepInput: {
              options: { ...req.body as z.infer<typeof chapterRuntimeRequestSchema>, signal: connection.signal },
              runtimeStream: true,
            },
          },
        );
        await streamToSSE(res, stream, onDone);
      } catch (error) {
        if (connection.signal.aborted) return;
        if (forwardBusinessError(error, next)) {
          return;
        }
        next(error);
      } finally {
        connection.dispose();
      }
    },
  );

  router.post(
    "/:id/chapters/:chapterId/generate",
    validate({ params: chapterParamsSchema, body: chapterRuntimeRequestSchema }),
    async (req, res, next) => {
      const connection = watchChapterConnection(res);
      try {
        connection.signal.throwIfAborted();
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        const { stream, onDone } = await stepModuleRunner.runStep<ChapterStreamResult>(
          DIRECTOR_EXECUTION_STEP_IDS.chapter_execution,
          {
            novelId: id,
            mode: "manual",
            targetType: "chapter",
            targetChapterId: chapterId,
            stepInput: { ...req.body as z.infer<typeof chapterRuntimeRequestSchema>, signal: connection.signal },
          },
        );
        await streamToSSE(res, stream, onDone);
      } catch (error) {
        if (connection.signal.aborted) return;
        if (forwardBusinessError(error, next)) {
          return;
        }
        next(error);
      } finally {
        connection.dispose();
      }
    },
  );
}
