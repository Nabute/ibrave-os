import { as, check, expectErr, expectOk, summary } from "./harness.mjs";
const finance = await as("finance");
const { data: c } = await finance.from("clients").select("id").eq("code", "VTST").single();
const { data: inv } = await finance.from("invoices").select("*").eq("client_id", c.id).eq("number", "INV-VTST-2026-0001").single();
check("repair: 0001 back to partially_paid (30000/64000)", inv.status === "partially_paid", `status=${inv.status}`);

const neg = await finance.rpc("record_payment", { p_invoice_id: inv.id, p_amount_minor: -100 });
expectErr("negative payment rejected", neg.error, "must be positive");

const over = await finance.rpc("record_payment", { p_invoice_id: inv.id, p_amount_minor: 99000 });
expectErr("overpayment rejected with remaining balance named", over.error, "exceeds the remaining balance");

const exact = await finance.rpc("record_payment", { p_invoice_id: inv.id, p_amount_minor: 34000, p_method: "wire", p_note: "v2 settle" });
expectOk("exact remaining payment accepted", exact.error);
check("status → paid", exact.data?.status === "paid", `status=${exact.data?.status}`);

const extra = await finance.rpc("record_payment", { p_invoice_id: inv.id, p_amount_minor: 100 });
expectErr("payment on paid invoice blocked", extra.error);

// 1-cent artifact voided
const { data: cent } = await finance.from("invoices").select("status, total_minor").eq("client_id", c.id).eq("number", "INV-VTST-2026-0003").single();
check("1-cent artifact voided by repair", cent.status === "void", `status=${cent.status}`);
summary("V2b Payment guards");
