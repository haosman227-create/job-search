import { requireBusinessContext } from "@/lib/data/business";
import {
  getBusinessProfile,
  listDepartments,
} from "@/lib/api/services/settings";
import { getBillingView } from "@/lib/api/services/billing";
import { getDataRights } from "@/lib/api/services/account";
import { DepartmentsEditor } from "@/components/settings/departments-editor";
import { BusinessProfileForm } from "@/components/settings/business-profile-form";
import { InviteForm } from "@/components/settings/invite-form";
import { BillingSection } from "@/components/settings/billing-section";
import { DataPrivacySection } from "@/components/settings/data-privacy-section";

export default async function SettingsPage() {
  const ctx = await requireBusinessContext();
  const [business, departmentRows, billing, dataRights] = await Promise.all([
    getBusinessProfile(ctx),
    listDepartments(ctx),
    getBillingView(ctx),
    getDataRights(ctx),
  ]);

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

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-medium">Plan &amp; billing</h2>
          <p className="text-sm text-muted-foreground">
            Your monthly invoice limit scales with your plan. Upgrade any time —
            new limits apply immediately.
          </p>
        </div>
        <BillingSection view={billing} />
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-medium">Data &amp; privacy</h2>
          <p className="text-sm text-muted-foreground">
            Export or delete your data, and control how long invoice images are
            kept.
          </p>
        </div>
        <DataPrivacySection initial={dataRights} />
      </section>
    </div>
  );
}
