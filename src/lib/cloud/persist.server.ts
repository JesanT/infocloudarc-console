import { getSql } from "@/lib/db";

export type ConsolePayload = {
  v: 1;
  cloud: Record<string, unknown>;
  dr: Record<string, unknown>;
};

export async function readConsole(): Promise<ConsolePayload | null> {
  const sql = await getSql();
  const rows = await sql<{ payload: unknown }>`select payload from console_state where id = 'primary'`;
  return asPayload(rows[0]?.payload);
}

export async function writeConsole(payload: ConsolePayload): Promise<void> {
  const sql = await getSql();
  const body = JSON.stringify(payload);
  await sql`
    insert into console_state (id, payload, updated_at)
    values ('primary', ${body}::jsonb, now())
    on conflict (id) do update set payload = excluded.payload, updated_at = now()
  `;
}

function asPayload(value: unknown): ConsolePayload | null {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object") return null;
  const row = parsed as Partial<ConsolePayload>;
  if (row.v !== 1 || !row.cloud || !row.dr) return null;
  return { v: 1, cloud: row.cloud, dr: row.dr };
}
