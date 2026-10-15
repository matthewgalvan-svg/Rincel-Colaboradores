import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildSignatureManifest, mapMpStatus, parseMpOrder, verifyMpSignature } from "@/lib/payments/mercadopago";

describe("Mercado Pago — firma de notificaciones", () => {
  const secret = "secreto-de-prueba";
  const sign = (manifest: string) => createHmac("sha256", secret).update(manifest).digest("hex");

  it("arma la plantilla oficial con data.id en minúsculas y omite valores ausentes", () => {
    expect(buildSignatureManifest("ORD01ABC", "req-1", "1700000000")).toBe("id:ord01abc;request-id:req-1;ts:1700000000;");
    expect(buildSignatureManifest(null, "req-1", "1700000000")).toBe("request-id:req-1;ts:1700000000;");
  });

  it("acepta una firma válida y rechaza alteraciones", () => {
    const ts = "1700000000";
    const v1 = sign(`id:ord01abc;request-id:r-9;ts:${ts};`);
    const headers = new Headers({ "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": "r-9" });
    const query = new URLSearchParams({ "data.id": "ORD01ABC", type: "order" });
    const ok = verifyMpSignature({ headers, query, body: { action: "order.processed", live_mode: false } }, secret);
    expect(ok).toMatchObject({ valid: true, topic: "order", resourceId: "ORD01ABC", requestId: "r-9", liveMode: false });

    const tampered = verifyMpSignature({ headers, query: new URLSearchParams({ "data.id": "ORD01XYZ", type: "order" }), body: {} }, secret);
    expect(tampered.valid).toBe(false);
    const wrongSecret = verifyMpSignature({ headers, query, body: {} }, "otro");
    expect(wrongSecret.valid).toBe(false);
    const noHeader = verifyMpSignature({ headers: new Headers({ "x-request-id": "r-9" }), query, body: {} }, secret);
    expect(noHeader.valid).toBe(false);
    const noSecret = verifyMpSignature({ headers, query, body: {} }, "");
    expect(noSecret.valid).toBe(false);
  });
});

describe("Mercado Pago — estados", () => {
  it("solo 'processed/accredited' es pago aprobado", () => {
    expect(mapMpStatus("processed", "accredited")).toBe("approved");
    expect(mapMpStatus("created", "accredited", false)).toBe("pending");
    expect(mapMpStatus("action_required", "waiting_payment")).toBe("in_process");
    expect(mapMpStatus("failed", "cc_rejected_other_reason")).toBe("rejected");
    expect(mapMpStatus("canceled", "canceled")).toBe("cancelled");
    expect(mapMpStatus("expired", "expired")).toBe("expired");
    expect(mapMpStatus("refunded", "refunded")).toBe("refunded");
    expect(mapMpStatus("processed", "partially_refunded")).toBe("partially_refunded");
    expect(mapMpStatus("charged_back", "settled")).toBe("charged_back");
    expect(mapMpStatus("algo_nuevo", "x")).toBe("pending");
  });

  it("convierte importes decimales sin errores de punto flotante", () => {
    const s = parseMpOrder({
      id: "ORD1",
      status: "processed",
      status_detail: "accredited",
      external_reference: "RC-2610-ABCDE",
      total_amount: "1050.10",
      total_paid_amount: "1050.10",
      country_code: "MEX",
      user_id: "42",
      transactions: { payments: [{ id: "P1", status: "processed", status_detail: "accredited", amount: "1050.10", paid_amount: "1050.10", payment_method: { id: "oxxo", type: "ticket" } }] },
    });
    expect(s.totalAmountCents).toBe(105010);
    expect(s.paidAmountCents).toBe(105010);
    expect(s.receiverId).toBe("42");
    expect(s.transactions[0]).toMatchObject({ id: "P1", status: "approved", paymentType: "ticket" });
  });
});
