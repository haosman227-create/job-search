"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { markupToPercent, percentToMarkup } from "@/lib/settings/markup";
import { apiJson, ApiClientError } from "@/lib/api/client";

interface Department {
  id: string;
  name: string;
  targetMarkup: number;
  displayOrder: number;
}

const inputCls =
  "rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

export function DepartmentsEditor({
  departments,
}: {
  departments: Department[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [newPercent, setNewPercent] = useState("30");

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(
          e instanceof ApiClientError ? e.message : "Something went wrong.",
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="p-2 font-medium">Department</th>
              <th className="p-2 font-medium">Markup %</th>
              <th className="p-2 font-medium">Order</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {departments.map((dept) => (
              <DepartmentRow
                key={dept.id}
                department={dept}
                disabled={isPending}
                onSave={(name, markup, order) =>
                  run(() =>
                    apiJson(`/api/v1/departments/${dept.id}`, "PATCH", {
                      name,
                      targetMarkup: markup,
                      displayOrder: order,
                    }),
                  )
                }
                onDelete={() =>
                  run(() => apiJson(`/api/v1/departments/${dept.id}`, "DELETE"))
                }
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">New department</span>
          <input
            className={inputCls}
            value={newName}
            placeholder="e.g. Bakery"
            onChange={(e) => setNewName(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Markup %</span>
          <input
            className={`${inputCls} w-24`}
            value={newPercent}
            inputMode="decimal"
            onChange={(e) => setNewPercent(e.target.value)}
          />
        </label>
        <Button
          type="button"
          size="sm"
          disabled={isPending}
          onClick={() => {
            const markup = percentToMarkup(newPercent);
            if (!newName.trim() || markup == null) {
              setError("Enter a name and a valid markup percent.");
              return;
            }
            run(() =>
              apiJson("/api/v1/departments", "POST", {
                name: newName.trim(),
                targetMarkup: markup,
              }),
            );
            setNewName("");
            setNewPercent("30");
          }}
        >
          Add
        </Button>
      </div>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function DepartmentRow({
  department,
  disabled,
  onSave,
  onDelete,
}: {
  department: Department;
  disabled: boolean;
  onSave: (name: string, markup: number, order: number) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(department.name);
  const [percent, setPercent] = useState(markupToPercent(department.targetMarkup));
  const [order, setOrder] = useState(String(department.displayOrder));

  const markup = percentToMarkup(percent);
  const orderNum = Number(order);
  const dirty =
    name !== department.name ||
    markup !== department.targetMarkup ||
    orderNum !== department.displayOrder;
  const valid = name.trim() !== "" && markup != null && Number.isInteger(orderNum);

  return (
    <tr className="border-b last:border-0">
      <td className="p-1">
        <input
          className={`${inputCls} w-full`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label={`Name for ${department.name}`}
        />
      </td>
      <td className="p-1">
        <input
          className={`${inputCls} w-20`}
          value={percent}
          inputMode="decimal"
          onChange={(e) => setPercent(e.target.value)}
          aria-label={`Markup for ${department.name}`}
        />
      </td>
      <td className="p-1">
        <input
          className={`${inputCls} w-16`}
          value={order}
          inputMode="numeric"
          onChange={(e) => setOrder(e.target.value)}
          aria-label={`Display order for ${department.name}`}
        />
      </td>
      <td className="p-1">
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={disabled || !dirty || !valid}
            onClick={() => valid && onSave(name.trim(), markup, orderNum)}
            className="text-xs underline disabled:opacity-40"
          >
            Save
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onDelete}
            className="text-xs text-destructive underline disabled:opacity-40"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
