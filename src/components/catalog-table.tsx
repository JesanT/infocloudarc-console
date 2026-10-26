import { useState } from "react";
import { Button, Empty, Field, Panel, Select, StatusPill, Table, TableWrap, Td, Th, fieldClass } from "@/components/ui";
import { useCloud } from "@/lib/cloud/store";

export type CatalogColumn = { key: string; label: string; options?: string[]; numeric?: boolean; wide?: boolean };

function readCell(row: object, key: string): string | number | null {
  const value = (row as Record<string, unknown>)[key];
  if (value == null || value === "") return null;
  if (typeof value === "number") return value;
  return String(value);
}

export function CatalogTable<T extends object>({
  title,
  subtitle,
  rows,
  columns,
  idKey,
  onSave,
  onDelete,
  allow,
  blank,
}: {
  title: string;
  subtitle: string;
  rows: T[];
  columns: CatalogColumn[];
  idKey: keyof T & string;
  onSave: (row: T) => void;
  onDelete: (id: string) => void;
  allow: boolean;
  blank: () => T;
}) {
  const flash = useCloud((s) => s.flash);
  const [draft, setDraft] = useState<T | null>(null);
  const locked = Boolean(draft && rows.some((row) => row[idKey] === draft[idKey]));

  function write(key: string, value: string | number | null) {
    if (!draft) return;
    setDraft({ ...(draft as object), [key]: value } as T);
  }

  return (
    <Panel
      title={title}
      subtitle={subtitle}
      action={
        allow ? (
          <Button variant="primary" onClick={() => setDraft(blank())}>
            Add
          </Button>
        ) : (
          <span className="text-xs text-faint">View only for this access</span>
        )
      }
    >
      {draft && (
        <form
          className="mb-4 grid gap-3 md:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            const key = String(draft[idKey] ?? "").trim();
            if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(key)) {
              flash("Use a short name with letters, numbers, dots, or dashes.");
              return;
            }
            onSave({ ...(draft as object), [idKey]: key } as T);
            setDraft(null);
          }}
        >
          {columns.map((column) => {
            const current = readCell(draft, column.key);
            return (
              <Field key={column.key} label={column.label}>
                {column.options ? (
                  <Select value={current == null ? "" : String(current)} onChange={(event) => write(column.key, event.target.value)}>
                    {column.options.map((option) => (
                      <option key={option || "none"} value={option}>
                        {option || "None"}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <input
                    className={fieldClass}
                    disabled={locked && column.key === idKey}
                    value={current == null ? "" : String(current)}
                    onChange={(event) => write(column.key, column.numeric ? Number(event.target.value || 0) : event.target.value)}
                  />
                )}
              </Field>
            );
          })}
          <div className="flex items-end gap-2">
            <Button variant="primary" type="submit">
              Save
            </Button>
            <Button onClick={() => setDraft(null)}>Cancel</Button>
          </div>
        </form>
      )}
      {rows.length === 0 ? (
        <Empty>Nothing in this view.</Empty>
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <Th key={column.key}>{column.label}</Th>
                ))}
                {allow && <Th>Actions</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row[idKey])}>
                  {columns.map((column) => {
                    const value = readCell(row, column.key);
                    return (
                      <Td key={column.key}>
                        {column.key === "status" || column.key === "health" || column.key === "ha" ? (
                          <StatusPill value={String(value ?? "")} />
                        ) : (
                          String(value ?? "—")
                        )}
                      </Td>
                    );
                  })}
                  {allow && (
                    <Td>
                      <div className="flex gap-1">
                        <Button onClick={() => setDraft(row)}>Edit</Button>
                        <Button variant="danger" onClick={() => onDelete(String(row[idKey]))}>
                          Delete
                        </Button>
                      </div>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </Panel>
  );
}
