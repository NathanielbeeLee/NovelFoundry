import type { OriginalReferenceBrief, ReferenceMechanisms, ReferenceSourceSnapshot } from "../domain/referenceStartContract";

export interface ReferencePipelinePorts {
  abstract(source: ReferenceSourceSnapshot, retry: boolean): Promise<ReferenceMechanisms>;
  generate(abstract: ReferenceMechanisms): Promise<OriginalReferenceBrief>;
  review(source: ReferenceSourceSnapshot, abstract: ReferenceMechanisms, brief: OriginalReferenceBrief): Promise<boolean>;
  stage(stage: "extracting" | "generating" | "reviewing"): Promise<void>;
}

/** The generation port cannot receive source sections, IDs or reviewer evidence. */
export async function generateIsolatedReferenceBrief(source: ReferenceSourceSnapshot, ports: ReferencePipelinePorts) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await ports.stage("extracting");
    const abstract = await ports.abstract(source, attempt > 0);
    await ports.stage("generating");
    const brief = await ports.generate(abstract);
    await ports.stage("reviewing");
    if (await ports.review(source, abstract, brief)) return { abstract, brief };
  }
  throw new Error("原创方向仍与参考作品过于接近，请调整创作要求后重试。");
}
