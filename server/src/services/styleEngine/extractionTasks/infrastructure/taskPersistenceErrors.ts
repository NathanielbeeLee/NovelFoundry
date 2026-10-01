import { Prisma } from "@prisma/client";

export function isMissingStyleExtractionTaskTableError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021";
}
