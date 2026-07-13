import { requireBusinessContext } from "@/lib/data/business";
import { DepartmentsEditor } from "@/components/settings/departments-editor";
import { BusinessProfileForm } from "@/components/settings/business-profile-form";
import { InviteForm } from "@/components/settings/invite-form";

interface DepartmentRow {
  id: string;
  name: string;
  target_markup: string | number;
  display_order: number;
}

export default async function SettingsPage() {
  const { supabase, businessId } = await requireBusinessContext();

  const [{ data: business }, { data: departments }] = await Promise.all([
    supabase.from("business").select("name").eq("id", businessId).maybeSingle(),
    supabase
      .from("department")
      .select("id, name, target_markup, display_order")
      .eq("business_id", businessId)
      .order("display_order"),
  ]);

  const departmentRows = ((departments ?? []) as DepartmentRow[]).map((d) => ({
    id: d.id,
    name: d.name,
    targetMarkup: Number(d.target_markup),
    displayOrder: d.display_order,
  }));

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      </div>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-medium">Departments</h2>
          <p className="text-sm text-muted-foreground">
            Each department&apos;s markup drives the computed sale price for its
            products. Changes apply to future invoices — existing prices stay
            put until a product&apos;s cost changes or you edit it.
          </p>
        </div>
        <DepartmentsEditor departments={departmentRows} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Business profile</h2>
        <BusinessProfileForm name={business?.name ?? ""} />
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-medium">Invite a teammate</h2>
          <p className="text-sm text-muted-foreground">
            They&apos;ll get an email invite and join this workspace with full
            access (no roles in v1).
          </p>
        </div>
        <InviteForm />
      </section>
    </div>
  );
}
