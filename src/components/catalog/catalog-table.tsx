"use client";

import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/domain";
import {
  applyCatalogView,
  DEFAULT_VIEW,
  type CatalogRow,
  type SortColumn,
} from "@/lib/catalog/row";
import { Badge } from "@/components/ui/badge";
import { SalePriceCell } from "./sale-price-cell";
import { DepartmentCell } from "./department-cell";

const SORTABLE: Record<string, SortColumn> = {
  barcode: "barcode",
  name: "name",
  department: "department",
  vendor: "vendor",
  cost: "cost",
  market: "market",
  sale: "sale",
  margin: "margin",
};

function marginLabel(ratio: number | null): string {
  return ratio == null ? "—" : `${Math.round(ratio * 100)}%`;
}

export function CatalogTable({
  rows,
  departments,
  vendors,
}: {
  rows: CatalogRow[];
  departments: { id: string; name: string }[];
  vendors: { id: string; name: string }[];
}) {
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn>(
    DEFAULT_VIEW.sortColumn,
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(
    DEFAULT_VIEW.sortDirection,
  );

  const viewed = useMemo(
    () =>
      applyCatalogView(rows, {
        search,
        departmentId,
        vendorId,
        sortColumn,
        sortDirection,
      }),
    [rows, search, departmentId, vendorId, sortColumn, sortDirection],
  );

  function toggleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      // Money/margin read best high-to-low; text ascending.
      setSortDirection(
        ["cost", "market", "sale", "margin"].includes(column) ? "desc" : "asc",
      );
    }
  }

  const columns = useMemo<ColumnDef<CatalogRow>[]>(
    () => [
      {
        id: "barcode",
        header: "Barcode",
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {row.original.barcode ?? "—"}
          </span>
        ),
      },
      {
        id: "name",
        header: "Product",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.original.name}</span>
            {row.original.costIncreased ? (
              <Badge variant="outline" title="Cost rose on the latest invoice">
                ▲ cost
              </Badge>
            ) : null}
          </div>
        ),
      },
      {
        id: "department",
        header: "Department",
        cell: ({ row }) => (
          <DepartmentCell row={row.original} departments={departments} />
        ),
      },
      {
        id: "vendor",
        header: "Vendor",
        cell: ({ row }) => row.original.vendorName ?? "—",
      },
      {
        id: "cost",
        header: "Cost",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.costCents != null
              ? formatCents(row.original.costCents)
              : "—"}
          </span>
        ),
      },
      {
        id: "market",
        header: "Market (AI)",
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground" title="AI estimate">
            {row.original.marketPriceCents != null
              ? formatCents(row.original.marketPriceCents)
              : "—"}
          </span>
        ),
      },
      {
        id: "sale",
        header: "Sale price",
        cell: ({ row }) => <SalePriceCell row={row.original} />,
      },
      {
        id: "margin",
        header: "Margin",
        cell: ({ row }) => (
          <span
            className={cn(
              "tabular-nums",
              row.original.marginRatio != null &&
                row.original.marginRatio < 0 &&
                "text-destructive",
            )}
          >
            {marginLabel(row.original.marginRatio)}
          </span>
        ),
      },
    ],
    [departments],
  );

  // TanStack's useReactTable isn't recognized by the React Compiler lint rule.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: viewed,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Search name or barcode…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56 rounded-md border bg-background px-3 py-1.5 text-sm"
          aria-label="Search catalog"
        />
        <select
          value={departmentId ?? ""}
          onChange={(e) => setDepartmentId(e.target.value || null)}
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
          aria-label="Filter by department"
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          value={vendorId ?? ""}
          onChange={(e) => setVendorId(e.target.value || null)}
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
          aria-label="Filter by vendor"
        >
          <option value="">All vendors</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <span className="ml-auto text-sm text-muted-foreground">
          {viewed.length} product{viewed.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="border-b bg-muted/40 text-left">
                {group.headers.map((h) => {
                  const col = SORTABLE[h.column.id];
                  const active = sortColumn === col;
                  return (
                    <th key={h.id} className="p-2 font-medium">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() => toggleSort(col)}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        <span className="text-xs text-muted-foreground">
                          {active ? (sortDirection === "asc" ? "▲" : "▼") : ""}
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="p-2 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {viewed.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-6 text-center text-muted-foreground">
                  No products match.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
