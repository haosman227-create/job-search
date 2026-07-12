"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { setProductDepartment } from "@/app/(app)/actions";
import type { CatalogRow } from "@/lib/catalog/row";

/**
 * Inline department editor (SPEC §5.1). Choosing a department is a manual
 * assignment: it clears the low-confidence badge (the server nulls the
 * confidence) and refreshes the computed price for the new markup.
 */
export function DepartmentCell({
  row,
  departments,
}: {
  row: CatalogRow;
  departments: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function change(departmentId: string | null) {
    if (departmentId === row.departmentId) return;
    startTransition(async () => {
      await setProductDepartment({ productId: row.id, departmentId });
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={row.departmentId ?? ""}
        disabled={isPending}
        onChange={(e) => change(e.target.value || null)}
        className="rounded border bg-background px-1.5 py-1 text-sm"
        aria-label={`Department for ${row.name}`}
      >
        <option value="">Unassigned</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      {row.lowConfidenceDepartment ? (
        <Badge variant="outline" title="Low-confidence AI assignment — please verify">
          ?
        </Badge>
      ) : null}
    </div>
  );
}
