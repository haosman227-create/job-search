import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { billingConfigured, planForPriceId } from "@/lib/billing/config";
import { getStripe } from "@/lib/billing/stripe";
import { recordAudit } from "@/lib/audit/record";
import {
  processStripeEvent,
  type WebhookDeps,
} from "@/lib/billing/webhook";
import type { BusinessBillingState } from "@/lib/billing/transition";
import type { SubscriptionStatus } from "@/lib/guardrails/policy";

// Stripe signs the raw body; parse nothing before verifying it. Node runtime so
// the Stripe SDK's crypto is available.
export const runtime = "nodejs";

/** Service-role webhook deps: dedupe, resolve tenant, read/write billing state. */
function webhookDeps(): WebhookDeps {
  const admin = createAdminClient();
  return {
    async claimEvent(id, type, businessId) {
      const { error } = await admin
        .from("stripe_event")
        .insert({ id, type, business_id: businessId, applied: false });
      if (!error) return "fresh";
      if (error.code !== "23505") {
        throw new Error(`stripe_event insert failed: ${error.message}`);
      }
      // Redelivery: resume if the earlier attempt never finished applying.
      const { data } = await admin
        .from("stripe_event")
        .select("applied")
        .eq("id", id)
        .maybeSingle();
      return data?.applied ? "done" : "unapplied";
    },
    async markApplied(id) {
      const { error } = await admin
        .from("stripe_event")
        .update({ applied: true })
        .eq("id", id);
      if (error) {
        throw new Error(`stripe_event markApplied failed: ${error.message}`);
      }
    },
    async resolveBusinessByCustomer(customerId) {
      const { data } = await admin
        .from("business")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .maybeSingle();
      return data?.id ?? null;
    },
    planForPriceId,
    async loadBillingState(businessId) {
      const { data } = await admin
        .from("business")
        .select(
          "plan_id, subscription_status, stripe_customer_id, stripe_subscription_id",
        )
        .eq("id", businessId)
        .maybeSingle();
      if (!data) return null;
      return {
        planId: data.plan_id,
        subscriptionStatus: data.subscription_status as SubscriptionStatus,
        stripeCustomerId: data.stripe_customer_id,
        stripeSubscriptionId: data.stripe_subscription_id,
      };
    },
    async saveBillingState(businessId, state: BusinessBillingState) {
      await admin
        .from("business")
        .update({
          plan_id: state.planId,
          subscription_status: state.subscriptionStatus,
          stripe_customer_id: state.stripeCustomerId,
          stripe_subscription_id: state.stripeSubscriptionId,
        })
        .eq("id", businessId);
      // System-actor audit entry (Stripe-driven, no user in the loop).
      await recordAudit(
        {
          businessId,
          actorUserId: null,
          action:
            state.subscriptionStatus === "canceled"
              ? "billing.subscription_canceled"
              : "billing.plan_changed",
          entityType: "subscription",
          entityId: state.stripeSubscriptionId,
          metadata: { planId: state.planId, status: state.subscriptionStatus },
        },
        admin,
      );
    },
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!billingConfigured()) {
    return NextResponse.json(
      { error: { code: "service_unavailable", message: "Billing not configured." } },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();
  const webhookSecret = getServerEnv().STRIPE_WEBHOOK_SECRET!;

  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      rawBody,
      signature ?? "",
      webhookSecret,
    );
  } catch {
    // Bad or missing signature — never trust the payload.
    return NextResponse.json(
      { error: { code: "invalid_signature", message: "Invalid signature." } },
      { status: 400 },
    );
  }

  try {
    const outcome = await processStripeEvent(webhookDeps(), event);
    // Always 200 on a verified event so Stripe stops retrying; the outcome is
    // for logs/observability, not the client.
    return NextResponse.json({ received: true, outcome });
  } catch (error) {
    // A transient failure: 500 so Stripe retries later (idempotency makes the
    // retry safe).
    console.error("stripe webhook processing failed", error);
    return NextResponse.json(
      { error: { code: "internal_error", message: "Processing failed." } },
      { status: 500 },
    );
  }
}
