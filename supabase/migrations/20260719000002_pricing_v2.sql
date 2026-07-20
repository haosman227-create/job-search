-- V2-6: reprice for the independent-restaurant market (SPEC-V2 §3). The V1 list
-- prices ($29/$79/$199) were pitched at a broader retail buyer; the V2 product
-- undercuts MarginEdge for small food businesses, so the monthly list prices
-- drop to $19 / $49 / $99. Display only — the real charge is the Stripe Price
-- resolved from env; this just renders the plan cards. Money stays integer cents.

update public.plan set price_cents = 1900 where id = 'starter';
update public.plan set price_cents = 4900 where id = 'growth';
update public.plan set price_cents = 9900 where id = 'pro';
