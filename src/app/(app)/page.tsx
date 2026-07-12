import Link from "next/link";
import { loadCatalog } from "@/lib/data/catalog";
import { CatalogTable } from "@/components/catalog/catalog-table";
import { Button } from "@/components/ui/button";

export default async function CatalogPage() {
  const { rows, departments, vendors } = await loadCatalog();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Catalog</h1>
        <Button render={<Link href="/invoices/upload" />}>Upload invoice</Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground">
          No products yet. Upload a supplier invoice and confirm it to start
          building the catalog.
        </p>
      ) : (
        <CatalogTable rows={rows} departments={departments} vendors={vendors} />
      )}
    </div>
  );
}
