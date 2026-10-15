import type { Prisma } from "@prisma/client";
import { runWithExecutionWriteScope, type ExecutionWriteScope } from "../../../../../../platform/db";
import { CommandLeaseAuthority, CommandLeaseLostError, type CommandLeaseIdentity } from "../domain/CommandLeaseAuthority";

export function commandLeasePredicate(identity: CommandLeaseIdentity, now = new Date()): Prisma.DirectorRunCommandWhereInput {
  return {
    id: identity.commandId, leaseOwner: identity.owner, attempt: identity.attempt,
    status: { in: ["leased", "running"] }, leaseExpiresAt: { gt: now },
  };
}

export function runWithCommandAuthority<T>(authority: CommandLeaseAuthority, run: () => T): T {
  const scope: ExecutionWriteScope = {
    signal: authority.signal,
    assertLive: () => authority.assertLive(),
    async lock(tx) {
      authority.assertLive();
      const locked = await tx.directorRunCommand.updateMany({
        where: commandLeasePredicate(authority.identity),
        // No-op generation write locks the claim without extending its lease.
        data: { attempt: authority.identity.attempt },
      });
      if (locked.count !== 1) {
        authority.revoke();
        throw new CommandLeaseLostError(authority.identity);
      }
    },
  };
  return runWithExecutionWriteScope(scope, run);
}
