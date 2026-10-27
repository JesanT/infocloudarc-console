import { useState } from "react";
import { useConfirm } from "@/components/confirm";
import { SelectBox, SelectionBar, rowClass, useSelection } from "@/components/selection";
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
  const query = useCloud((s) => s.query);
  const { ask, dialog } = useConfirm();
  const [draft, setDraft] = useState<T | null>(null);
  const locked = Boolean(draft && rows.some((row) => row[idKey] === draft[idKey]));
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? rows.filter((row) => {
        const values = [String(row[idKey] ?? ""), ...columns.map((column) => String(readCell(row, column.key) ?? ""))];
        return values.join(" ").toLowerCase().includes(needle);
      })
    : rows;
  const ids = visible.map((row) => String(row[idKey]));
  const pick = useSelection(ids);

  function write(key: string, value: string | number | null) {
    if (!draft) return;
    setDraft({ ...(draft as object), [key]: value } as T);
  }

  function removeIds(target: string[]) {
    ask({
      title: target.length === 1 ? `Delete ${target[0]}?` : `Delete ${target.length} records?`,
      body: "This removes the console records only. It does not delete a guest or files on a hypervisor.",
      confirmLabel: "Delete",
      danger: true,
      run: () => {
        for (const id of target) onDelete(id);
        pick.clear();
      },
    });
  }

  return (
    <>
      {dialog}
      <Panel
        title={title}
        subtitle={subtitle}
        action={
          allow ? (
            <Button variant="primary" onClick={() => setDraft(blank())}>Add</Button>
          ) : (
            <span className="text-xs text-faint">View only for this access</span>
          )
        }
      >
        {draft && (
          <form
            className="mb-4 grid gap-3 border border-line bg-[#faf9f8] p-3 md:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              const key = String(draft[idKey] ?? "").trim();
              if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(key)) {
                flash("Use a short name with letters, numbers, dots, or dashes.");
                return;
              }
              const next = { ...(draft as object), [idKey]: key } as T;
              const save = () => {
                onSave(next);
                setDraft(null);
              };
              if (rows.some((row) => String(row[idKey]) === key)) {
                ask({
                  title: `Save changes to ${key}?`,
                  body: "This replaces the console record. It does not change a guest or move files.",
                  confirmLabel: "Save",
                  run: save,
                });
                return;
              }
              save();
            }}
          >
            {columns.map((column) => {
              const current = readCell(draft, column.key);
              return (
                <Field key={column.key} label={column.label}>
                  {column.options ? (
                    <Select value={current == null ? "" : String(current)} onChange={(event) => write(column.key, event.target.value)}>
                      {column.options.map((option) => (
                        <option key={option || "none"} value={option}>{option || "None"}</option>
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
              <Button variant="primary" type="submit">Save</Button>
              <Button onClick={() => setDraft(null)}>Cancel</Button>
            </div>
          </form>
        )}
        <SelectionBar
          count={pick.picked.length}
          onClear={pick.clear}
          onEdit={allow && pick.picked.length === 1 ? () => {
            const row = visible.find((item) => String(item[idKey]) === pick.picked[0]);
            if (row) setDraft(row);
          } : undefined}
          onDelete={allow ? () => removeIds(pick.picked) : undefined}
        />
        {visible.length === 0 ? (
          <Empty>{rows.length === 0 ? "Nothing in this view. Add a record to start." : "No rows match the filter."}</Empty>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>
                    <SelectBox checked={pick.all} onChange={pick.toggleAll} label="Select all rows" />
                  </Th>
                  {columns.map((column) => (
                    <Th key={column.key}>{column.label}</Th>
                  ))}
                  {allow && <Th>Actions</Th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const id = String(row[idKey]);
                  return (
                    <tr key={id} className={rowClass(pick.has(id))} onClick={() => pick.toggle(id)}>
                      <Td>
                        <SelectBox checked={pick.has(id)} onChange={() => pick.toggle(id)} label={`Select ${id}`} />
                      </Td>
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
                          <div className="flex gap-1" onClick={(event) => event.stopPropagation()}>
                            <Button onClick={() => setDraft(row)}>Edit</Button>
                            <Button variant="danger" onClick={() => removeIds([id])}>Delete</Button>
                          </div>
                        </Td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Panel>
    </>
  );
}
