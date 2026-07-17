import "server-only";
import { ApiError } from "@/lib/api/errors";
import type { ApiContext } from "@/lib/api/context";
import {
  billingConfigured,
  priceIdForPlan,
  type PaidPlanId,
} from "@/lib/billing/config";
import { getStripe } from "@/lib/billing/stripe";

/**
 * Billing operations for the dashboard/native client (SPEC-SAAS §9.5). Checkout
 * starts a subscription; Portal lets a customer manage it. Both degrade to 503
 * when billing isn't configured, so the rest of the app runs without Stripe.
 */

function ensureConfigured(): void {
  if (!billingConfigured()) {
    throw new ApiError("service_unavailable", "Billing is not configured.");
  }
}

export interface BillingPlan {
  id: string;
  name: string;
  priceCents: number;
  monthlyInvoiceQuota: number;
  seatQuota: number | null;
}

export interface BillingView {
  plans: BillingPlan[];
  currentPlanId: string;
  subscriptionStatus: string;
  hasBillingAccount: boolean;
  billingConfigured: boolean;
}

/** Everything the settings billing section renders (SPEC-SAAS §7). */
export async function getBillingView(ctx: ApiContext): Promise<BillingView> {
  const [{ data: plans }, { data: biz }] = await Promise.all([
    ctx.supabase
      .from("plan")
      .select("id, name, price_cents, monthly_invoice_quota, seat_quota")
      .order("sort_order"),
    ctx.supabase
      .from("business")
      .select("plan_id, subscription_status, stripe_customer_id")
      .eq("id", ctx.businessId)
      .maybeSingle(),
  ]);

  return {
    plans: ((plans ?? []) as Record<string, unknown>[]).map((p) => ({
      id: p.id as string,
      name: p.name as string,
      priceCents: p.price_cents as number,
      monthlyInvoiceQuota: p.monthly_invoice_quota as number,
      seatQuota: (p.seat_quota as number | null) ?? null,
    })),
    currentPlanId: (biz?.plan_id as string) ?? "trial",
    subscriptionStatus: (biz?.subscription_status as string) ?? "trialing",
    hasBillingAccount: Boolean(biz?.stripe_customer_id),
    billingConfigured: billingConfigured(),
  };
}

/** Find-or-create the tenant's Stripe customer, persisting the id. */
async function ensureCustomer(ctx: ApiContext): Promise<string> {
  const { data: biz } = await ctx.supabase
    .from("business")
    .select("stripe_customer_id, name")
    .eq("id", ctx.businessId)
    .maybeSingle();
  if (biz?.stripe_customer_id) return biz.stripe_customer_id;

  const {
    data: { user },
  } = await ctx.supabase.auth.getUser();

  const customer = await getStripe().customers.create({
    email: user?.email ?? undefined,
    name: biz?.name ?? undefined,
    metadata: { business_id: ctx.businessId },
  });

  await ctx.supabase
    .from("business")
    .update({ stripe_customer_id: customer.id })
    .eq("id", ctx.businessId);
  return customer.id;
}

export async function createCheckoutSession(
  ctx: ApiContext,
  planId: PaidPlanId,
  baseUrl: string,
): Promise<{ url: string }> {
  ensureConfigured();
  const priceId = priceIdForPlan(planId);
  if (!priceId) {
    throw new ApiError("validation_failed", "Unknown plan.");
  }

  const customerId = await ensureCustomer(ctx);
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/settings?billing=success`,
    cancel_url: `${baseUrl}/settings?billing=cancelled`,
    // Carried back on checkout.session.completed to identify the tenant + plan.
    metadata: { business_id: ctx.businessId, plan_id: planId },
    subscription_data: {
      metadata: { business_id: ctx.businessId, plan_id: planId },
    },
  });

  if (!session.url) {
    throw new ApiError("internal_error", "Could not start checkout.");
  }
  return { url: session.url };
}

export async function createPortalSession(
  ctx: ApiContext,
  baseUrl: string,
): Promise<{ url: string }> {
  ensureConfigured();
  const { data: biz } = await ctx.supabase
    .from("business")
    .select("stripe_customer_id")
    .eq("id", ctx.businessId)
    .maybeSingle();
  if (!biz?.stripe_customer_id) {
    throw new ApiError(
      "invalid_state",
      "No billing account yet — start a subscription first.",
    );
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: biz.stripe_customer_id,
    return_url: `${baseUrl}/settings`,
  });
  return { url: session.url };
}
