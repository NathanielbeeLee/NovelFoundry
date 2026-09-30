import fs from "node:fs";
import path from "node:path";
import { resolveServerRoot } from "../../../../../runtime/appPaths";

export interface PolishRelation { owner: string; target: string; fields: string[]; references: string[]; }
let cache: PolishRelation[] | undefined;
const delegate = (model: string) => model[0].toLowerCase() + model.slice(1);
/** Prisma 7's runtime DMMF omits FK field mappings. Read the packaged schema, not guessed field names. */
export function polishRelations(): PolishRelation[] {
  if (cache) return cache;
  const schema = fs.readFileSync(path.join(resolveServerRoot(), "src/prisma/schema.prisma"), "utf8").replace(/\/\/[^\n]*/g, "");
  const result: PolishRelation[] = [];
  for (const model of schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    for (const field of model[2].matchAll(/^\s*\w+\s+(\w+)\??\s+@relation\(([^)]*)\)/gm)) {
      const fields = field[2].match(/fields:\s*\[([^\]]+)\]/)?.[1].split(",").map((item) => item.trim());
      const references = field[2].match(/references:\s*\[([^\]]+)\]/)?.[1].split(",").map((item) => item.trim());
      if (fields && references && fields.length === references.length) result.push({ owner: delegate(model[1]), target: delegate(field[1]), fields, references });
    }
  }
  const expected = [...schema.matchAll(/@relation\([^)]*fields:\s*\[/g)].length;
  if (!result.length || result.length !== expected) throw new Error("无法完整读取关联约束，不能安全撤销。");
  cache = result;
  return result;
}
