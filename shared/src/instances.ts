import fs from "node:fs";

import { eq } from "drizzle-orm";

import { store } from "./client";
import { instances } from "./schema";
import type { InstanceRow, NewInstanceRow } from "./schema";

export async function upsertInstance(row: NewInstanceRow): Promise<void> {
  const { key, ...rest } = row;
  await store()
    .db.insert(instances)
    .values(row)
    .onConflictDoUpdate({ target: instances.key, set: rest });
}

export async function removeInstance(key: string): Promise<void> {
  await store().db.delete(instances).where(eq(instances.key, key));
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM is a process we may not signal, not a process that is gone. A
    // caller inside a sandbox gets it for everything outside that sandbox.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export async function listInstances(): Promise<InstanceRow[]> {
  const rows = await store().db.select().from(instances);
  const live: InstanceRow[] = [];
  for (const row of rows) {
    if (alive(row.pid)) {
      live.push(row);
      continue;
    }
    await removeInstance(row.key);
    fs.rmSync(row.socket, { force: true });
  }
  return live.sort((a, b) => a.startedAt - b.startedAt);
}
