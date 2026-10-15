import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export interface StatsRange {
  from: Date;
  to: Date;
  includeTest: boolean;
}

export interface Stats {
  /** Facturación cobrada (no es ganancia: no descuenta costos, comisiones ni envíos). */
  collectedCents: number;
  paidOrders: number;
  avgTicketCents: number | null;
  refunds: { count: number; amountCents: number };
  sessions: number;
  conversion: number | null;
  funnel: { views: number; addToCart: number; beginCheckout: number; paymentStarted: number; purchases: number };
  checkoutAbandonment: number | null;
  cartAbandonment: number | null;
  paymentsByStatus: { status: string; n: number }[];
  paymentMethods: { type: string; n: number; amountCents: number }[];
  byProduct: { productId: string; name: string; units: number; amountCents: number }[];
  bySource: { source: string; orders: number; amountCents: number }[];
  byDevice: { device: string; orders: number; sessions: number }[];
  ctaClicks: { cta: string; n: number }[];
  whatsappClicks: number;
  quoteErrors: { code: string; n: number }[];
  prepHoursAvg: number | null;
  deliveryHoursAvg: number | null;
  labelFailures: number;
  newCustomers: number;
  returningCustomers: number;
}

const num = (v: unknown) => Number(v ?? 0);

/** Métricas del periodo. Si no hay integración o datos, el valor queda en 0 / null ("Sin datos"). */
export async function computeStats(r: StatsRange): Promise<Stats> {
  const testOrders = r.includeTest ? sql`true` : sql`o.is_test = false`;
  const testEvents = r.includeTest ? sql`true` : sql`e.is_test = false`;
  const inRange = (col: ReturnType<typeof sql.raw>) => sql`${col} >= ${r.from} and ${col} < ${r.to}`;

  const [sales] = (
    await db.execute(sql`select coalesce(sum(o.total_cents),0) as amount, count(*) as n from orders o
      where o.paid_at is not null and ${inRange(sql.raw("o.paid_at"))} and ${testOrders}
      and o.payment_status in ('approved','partially_refunded','refunded','charged_back')`)
  ).rows as { amount: string; n: string }[];

  const [ref] = (
    await db.execute(sql`select count(*) as n, coalesce(sum(rf.amount_cents),0) as amount from refunds rf join orders o on o.id = rf.order_id
      where rf.status = 'approved' and ${inRange(sql.raw("rf.updated_at"))} and ${testOrders}`)
  ).rows as { n: string; amount: string }[];

  const funnelRows = (
    await db.execute(sql`select e.name, count(*) as n, count(distinct e.session_id) as s from analytics_events e
      where ${inRange(sql.raw("e.created_at"))} and ${testEvents} group by e.name`)
  ).rows as { name: string; n: string; s: string }[];
  const ev = (name: string) => num(funnelRows.find((x) => x.name === name)?.n);

  const [sess] = (await db.execute(sql`select count(distinct e.session_id) as n from analytics_events e where ${inRange(sql.raw("e.created_at"))} and ${testEvents} and e.session_id is not null`)).rows as { n: string }[];

  // Abandono de checkout: sesiones que iniciaron checkout y no registraron compra pagada en el periodo.
  const [aband] = (
    await db.execute(sql`with s as (
        select e.session_id,
          bool_or(e.name = 'begin_checkout') as checkout,
          bool_or(e.name = 'add_to_cart') as cart,
          bool_or(e.name = 'purchase') as bought
        from analytics_events e where ${inRange(sql.raw("e.created_at"))} and ${testEvents} and e.session_id is not null group by e.session_id)
      select count(*) filter (where checkout) as checkout, count(*) filter (where checkout and not bought) as checkout_lost,
             count(*) filter (where cart) as cart, count(*) filter (where cart and not checkout) as cart_lost from s`)
  ).rows as { checkout: string; checkout_lost: string; cart: string; cart_lost: string }[];

  const paymentsByStatus = (
    (await db.execute(sql`select p.status, count(*) as n from payments p join orders o on o.id = p.order_id where ${inRange(sql.raw("p.created_at"))} and ${testOrders} group by p.status order by n desc`)).rows as { status: string; n: string }[]
  ).map((x) => ({ status: x.status, n: num(x.n) }));

  const paymentMethods = (
    (
      await db.execute(sql`select coalesce(p.payment_type,'desconocido') as type, count(*) as n, coalesce(sum(coalesce(p.paid_amount_cents, p.amount_cents)),0) as amount
        from payments p join orders o on o.id = p.order_id where p.status in ('approved','partially_refunded','refunded') and ${inRange(sql.raw("p.created_at"))} and ${testOrders} group by 1 order by n desc`)
    ).rows as { type: string; n: string; amount: string }[]
  ).map((x) => ({ type: x.type, n: num(x.n), amountCents: num(x.amount) }));

  const byProduct = (
    (
      await db.execute(sql`select i.product_id, max(i.product_name) as name, sum(i.quantity) as units, sum(i.line_total_cents) as amount
        from order_items i join orders o on o.id = i.order_id where o.paid_at is not null and ${inRange(sql.raw("o.paid_at"))} and ${testOrders}
        and o.payment_status in ('approved','partially_refunded','refunded','charged_back') group by i.product_id order by amount desc`)
    ).rows as { product_id: string; name: string; units: string; amount: string }[]
  ).map((x) => ({ productId: x.product_id, name: x.name, units: num(x.units), amountCents: num(x.amount) }));

  const bySource = (
    (
      await db.execute(sql`select coalesce(nullif(o.attribution->>'utm_source',''), nullif(o.attribution->>'referrer_host',''), 'directo') as source, count(*) as n, sum(o.total_cents) as amount
        from orders o where o.paid_at is not null and ${inRange(sql.raw("o.paid_at"))} and ${testOrders} group by 1 order by n desc limit 20`)
    ).rows as { source: string; n: string; amount: string }[]
  ).map((x) => ({ source: x.source, orders: num(x.n), amountCents: num(x.amount) }));

  const devOrders = (await db.execute(sql`select coalesce(o.device_type,'desconocido') as device, count(*) as n from orders o where o.paid_at is not null and ${inRange(sql.raw("o.paid_at"))} and ${testOrders} group by 1`)).rows as { device: string; n: string }[];
  const devSessions = (await db.execute(sql`select coalesce(e.device,'desconocido') as device, count(distinct e.session_id) as n from analytics_events e where ${inRange(sql.raw("e.created_at"))} and ${testEvents} group by 1`)).rows as { device: string; n: string }[];
  const devices = [...new Set([...devOrders.map((d) => d.device), ...devSessions.map((d) => d.device)])];
  const byDevice = devices.map((d) => ({ device: d, orders: num(devOrders.find((x) => x.device === d)?.n), sessions: num(devSessions.find((x) => x.device === d)?.n) }));

  const ctaClicks = (
    (await db.execute(sql`select e.cta_id, count(*) as n from analytics_events e where e.name = 'cta_click' and ${inRange(sql.raw("e.created_at"))} and ${testEvents} group by 1 order by n desc limit 20`)).rows as { cta_id: string; n: string }[]
  ).map((x) => ({ cta: x.cta_id ?? "—", n: num(x.n) }));

  const quoteErrors = (
    (await db.execute(sql`select coalesce(e.meta->>'code','desconocido') as code, count(*) as n from analytics_events e where e.name = 'shipping_quote_error' and ${inRange(sql.raw("e.created_at"))} and ${testEvents} group by 1`)).rows as { code: string; n: string }[]
  ).map((x) => ({ code: x.code, n: num(x.n) }));

  const [times] = (
    await db.execute(sql`select
        avg(extract(epoch from (lbl.occurred_at - o.paid_at))/3600) as prep,
        avg(extract(epoch from (dlv.occurred_at - lbl.occurred_at))/3600) as delivery
      from orders o join shipments s on s.order_id = o.id
      left join lateral (select min(occurred_at) as occurred_at from shipment_events where shipment_id = s.id and status = 'label_created') lbl on true
      left join lateral (select min(occurred_at) as occurred_at from shipment_events where shipment_id = s.id and status = 'delivered') dlv on true
      where o.paid_at is not null and ${inRange(sql.raw("o.paid_at"))} and ${testOrders}`)
  ).rows as { prep: string | null; delivery: string | null }[];

  const [labelFail] = (await db.execute(sql`select count(*) as n from shipments s join orders o on o.id = s.order_id where s.last_error is not null and ${inRange(sql.raw("s.updated_at"))} and ${testOrders}`)).rows as { n: string }[];

  // Nuevos vs. recurrentes por correo seudonimizado (hash), solo cuando es identificable.
  const [cust] = (
    await db.execute(sql`with p as (select o.email_hash, min(o.paid_at) as first_paid from orders o where o.paid_at is not null and ${testOrders} group by o.email_hash)
      select count(*) filter (where p.first_paid >= ${r.from}) as nuevos, count(*) filter (where p.first_paid < ${r.from}) as recurrentes
      from p where p.email_hash in (select o.email_hash from orders o where o.paid_at is not null and ${inRange(sql.raw("o.paid_at"))} and ${testOrders})`)
  ).rows as { nuevos: string; recurrentes: string }[];

  const collected = num(sales.amount);
  const paid = num(sales.n);
  const sessions = num(sess.n);
  return {
    collectedCents: collected,
    paidOrders: paid,
    avgTicketCents: paid ? Math.round(collected / paid) : null,
    refunds: { count: num(ref.n), amountCents: num(ref.amount) },
    sessions,
    conversion: sessions ? paid / sessions : null,
    funnel: { views: ev("view_item"), addToCart: ev("add_to_cart"), beginCheckout: ev("begin_checkout"), paymentStarted: ev("payment_started"), purchases: ev("purchase") },
    checkoutAbandonment: num(aband.checkout) ? num(aband.checkout_lost) / num(aband.checkout) : null,
    cartAbandonment: num(aband.cart) ? num(aband.cart_lost) / num(aband.cart) : null,
    paymentsByStatus,
    paymentMethods,
    byProduct,
    bySource,
    byDevice,
    ctaClicks,
    whatsappClicks: ev("whatsapp_click"),
    quoteErrors,
    prepHoursAvg: times?.prep !== null && times?.prep !== undefined ? Number(times.prep) : null,
    deliveryHoursAvg: times?.delivery !== null && times?.delivery !== undefined ? Number(times.delivery) : null,
    labelFailures: num(labelFail.n),
    newCustomers: num(cust.nuevos),
    returningCustomers: num(cust.recurrentes),
  };
}

/** Periodo anterior de la misma duración, para comparar. */
export function previousRange(r: StatsRange): StatsRange {
  const len = r.to.getTime() - r.from.getTime();
  return { from: new Date(r.from.getTime() - len), to: new Date(r.from.getTime()), includeTest: r.includeTest };
}
