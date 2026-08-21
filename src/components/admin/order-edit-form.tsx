"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  findDistrictByNameInProvince,
  findProvinceByName,
  findSubdistrictByNameInDistrict,
  findSubdistrictById,
  getDistrictsByProvince,
  getProvinces,
  getSubdistrictsByDistrict,
} from "@/lib/thai-address";
import type { AdminCatalogVariant } from "@/lib/admin/get-admin-catalog";
import type { AdminOrderDetail } from "@/lib/admin/get-admin-order-detail";

interface ContactState {
  fullName: string;
  phone: string;
  lineId: string;
  email: string;
}

interface AddressState {
  addressLine: string;
  soiRoad: string;
  provinceId: string;
  districtId: string;
  subdistrictId: string;
  postalCode: string;
  deliveryNote: string;
}

/** One physical shirt (§1/§7) — the editor works per-shirt, not per order_items line, matching production export's own unit exactly. */
interface ShirtRow {
  key: string;
  variantId: string;
  colorId: string;
  sizeId: string;
  name: string;
  number: string;
}

let rowKeySeq = 0;
function nextRowKey(): string {
  rowKeySeq += 1;
  return `row-${rowKeySeq}`;
}

function expandItemsToShirtRows(items: NonNullable<AdminOrderDetail["editable"]>["items"]): ShirtRow[] {
  const rows: ShirtRow[] = [];
  for (const item of items) {
    const customizations = item.customizations ?? Array.from({ length: item.quantity }, () => ({ name: null, number: null }));
    for (const c of customizations) {
      rows.push({
        key: nextRowKey(),
        variantId: item.variantId,
        colorId: item.colorId,
        sizeId: item.sizeId,
        name: c.name ?? "",
        number: c.number ?? "",
      });
    }
  }
  return rows;
}

function initAddressState(address: NonNullable<AdminOrderDetail["editable"]>["address"]): AddressState {
  const province = findProvinceByName(address.province);
  const district = province ? findDistrictByNameInProvince(address.district, province.id) : undefined;
  const subdistrict = district ? findSubdistrictByNameInDistrict(address.subdistrict, district.id) : undefined;
  return {
    addressLine: address.addressLine,
    soiRoad: address.soiRoad,
    provinceId: province ? String(province.id) : "",
    districtId: district ? String(district.id) : "",
    subdistrictId: subdistrict ? String(subdistrict.id) : "",
    postalCode: address.postalCode,
    deliveryNote: address.deliveryNote,
  };
}

export function OrderEditForm({
  orderNumber,
  editable,
  paymentStatus,
  catalogVariants,
  onCancel,
}: {
  orderNumber: string;
  editable: NonNullable<AdminOrderDetail["editable"]>;
  paymentStatus: string;
  catalogVariants: AdminCatalogVariant[];
  onCancel: () => void;
}) {
  const router = useRouter();

  const [contact, setContact] = useState<ContactState>({ ...editable.customer });
  const [address, setAddress] = useState<AddressState>(() => initAddressState(editable.address));
  const [rows, setRows] = useState<ShirtRow[]>(() => expandItemsToShirtRows(editable.items));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const provinces = useMemo(() => getProvinces(), []);
  const districts = useMemo(
    () => getDistrictsByProvince(address.provinceId ? Number(address.provinceId) : null),
    [address.provinceId],
  );
  const subdistricts = useMemo(
    () => getSubdistrictsByDistrict(address.districtId ? Number(address.districtId) : null),
    [address.districtId],
  );

  const colorOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const v of catalogVariants) seen.set(v.colorId, v.colorName);
    return [...seen.entries()].map(([colorId, colorName]) => ({ colorId, colorName }));
  }, [catalogVariants]);

  function sizesForColor(colorId: string) {
    return catalogVariants.filter((v) => v.colorId === colorId);
  }

  function handleProvinceChange(value: string) {
    setAddress((prev) => ({ ...prev, provinceId: value, districtId: "", subdistrictId: "", postalCode: "" }));
  }
  function handleDistrictChange(value: string) {
    setAddress((prev) => ({ ...prev, districtId: value, subdistrictId: "", postalCode: "" }));
  }
  function handleSubdistrictChange(value: string) {
    const subdistrict = findSubdistrictById(value ? Number(value) : null);
    setAddress((prev) => ({ ...prev, subdistrictId: value, postalCode: subdistrict?.zipCode ?? "" }));
  }

  function updateRow(key: string, patch: Partial<ShirtRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function handleColorChange(key: string, colorId: string) {
    const firstVariant = catalogVariants.find((v) => v.colorId === colorId);
    updateRow(key, { colorId, sizeId: firstVariant?.sizeId ?? "", variantId: firstVariant?.variantId ?? "" });
  }

  function handleSizeChange(key: string, sizeId: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const variant = catalogVariants.find((v) => v.colorId === r.colorId && v.sizeId === sizeId);
        return { ...r, sizeId, variantId: variant?.variantId ?? r.variantId };
      }),
    );
  }

  function addRow() {
    const first = catalogVariants[0];
    setRows((prev) => [
      ...prev,
      { key: nextRowKey(), variantId: first?.variantId ?? "", colorId: first?.colorId ?? "", sizeId: first?.sizeId ?? "", name: "", number: "" },
    ]);
  }

  function duplicateRow(key: string) {
    const source = rows.find((r) => r.key === key);
    if (!source) return;
    setRows((prev) => {
      const index = prev.findIndex((r) => r.key === key);
      const copy: ShirtRow = { ...source, key: nextRowKey() };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
  }

  function removeRow(key: string) {
    if (rows.length <= 1) {
      setSubmitError("คำสั่งซื้อต้องมีเสื้ออย่างน้อย 1 ตัว");
      return;
    }
    if (!window.confirm("ยืนยันการลบเสื้อตัวนี้ออกจากคำสั่งซื้อหรือไม่?")) return;
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!contact.fullName.trim()) errors.fullName = "กรุณากรอกชื่อผู้รับ";
    if (!contact.phone.trim()) errors.phone = "กรุณากรอกเบอร์โทรศัพท์";
    if (!contact.email.trim()) errors.email = "กรุณากรอกอีเมล";
    if (!address.addressLine.trim()) errors.addressLine = "กรุณากรอกรายละเอียดที่อยู่";
    if (!address.provinceId) errors.provinceId = "กรุณาเลือกจังหวัด";
    if (!address.districtId) errors.districtId = "กรุณาเลือกอำเภอ / เขต";
    if (!address.subdistrictId) errors.subdistrictId = "กรุณาเลือกตำบล / แขวง";

    const newRowErrors: Record<string, string> = {};
    for (const row of rows) {
      if (!row.variantId) newRowErrors[row.key] = "กรุณาเลือกสีและไซซ์";
      else if (/[/\n\r]/.test(row.name)) newRowErrors[row.key] = 'ชื่อห้ามมีเครื่องหมาย "/" หรือขึ้นบรรทัดใหม่';
    }
    setRowErrors(newRowErrors);
    setFieldErrors(errors);
    return Object.keys(errors).length === 0 && Object.keys(newRowErrors).length === 0;
  }

  // Group per-shirt rows back into { variantId, quantity, customizations[] }
  // lines in first-seen order — the shape admin_update_order_details expects.
  function buildItemsPayload() {
    const order: string[] = [];
    const groups = new Map<string, { name: string | null; number: string | null }[]>();
    for (const row of rows) {
      if (!groups.has(row.variantId)) {
        groups.set(row.variantId, []);
        order.push(row.variantId);
      }
      groups.get(row.variantId)!.push({ name: row.name.trim() || null, number: row.number.trim() || null });
    }
    return order.map((variantId) => {
      const customizations = groups.get(variantId)!;
      return { variantId, quantity: customizations.length, customizations };
    });
  }

  async function submit(confirmTotalChange: boolean) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderNumber}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: contact,
          address,
          items: buildItemsPayload(),
          confirmTotalChange,
        }),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        if (body?.error?.code === "CONFIRM_TOTAL_CHANGE_REQUIRED" && !confirmTotalChange) {
          const ok = window.confirm(
            "คำสั่งซื้อนี้ยืนยันการชำระเงินแล้ว และยอดรวมจะเปลี่ยนแปลงจากการแก้ไขนี้ ต้องการดำเนินการต่อหรือไม่?",
          );
          if (ok) {
            await submit(true);
            return;
          }
          setSubmitError("ยกเลิกการบันทึก — ยอดรวมจะเปลี่ยนแปลงบนคำสั่งซื้อที่ชำระเงินแล้ว");
          setSubmitting(false);
          return;
        }
        setSubmitError(body?.error?.message ?? "บันทึกการแก้ไขไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
        setSubmitting(false);
        return;
      }

      setSubmitting(false);
      router.refresh();
      onCancel();
    } catch {
      setSubmitError("เครือข่ายมีปัญหา กรุณาลองใหม่อีกครั้ง");
      setSubmitting(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!validate()) return;
    void submit(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 border border-line p-4">
      {paymentStatus === "verified" && (
        <p className="border border-accent/40 bg-accent/5 p-2 text-xs text-accent">
          คำสั่งซื้อนี้ยืนยันการชำระเงินแล้ว — หากแก้ไขจำนวน/สินค้าจนยอดรวมเปลี่ยนแปลง ระบบจะขอให้ยืนยันอีกครั้งก่อนบันทึก
        </p>
      )}

      <fieldset className="flex flex-col gap-3">
        <legend className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">ข้อมูลผู้รับ</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField label="ชื่อ-นามสกุลผู้รับ" value={contact.fullName} onChange={(v) => setContact((p) => ({ ...p, fullName: v }))} error={fieldErrors.fullName} />
          <TextField label="เบอร์โทรศัพท์" value={contact.phone} onChange={(v) => setContact((p) => ({ ...p, phone: v }))} error={fieldErrors.phone} />
          <TextField label="LINE ID (ถ้ามี)" value={contact.lineId} onChange={(v) => setContact((p) => ({ ...p, lineId: v }))} />
          <TextField label="อีเมล" value={contact.email} onChange={(v) => setContact((p) => ({ ...p, email: v }))} error={fieldErrors.email} type="email" />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">ที่อยู่จัดส่ง</legend>
        <TextField label="บ้านเลขที่ / อาคาร / หมู่บ้าน / ห้อง" value={address.addressLine} onChange={(v) => setAddress((p) => ({ ...p, addressLine: v }))} error={fieldErrors.addressLine} />
        <TextField label="ซอย / ถนน (ถ้ามี)" value={address.soiRoad} onChange={(v) => setAddress((p) => ({ ...p, soiRoad: v }))} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectField
            label="จังหวัด"
            placeholder="เลือกจังหวัด"
            value={address.provinceId}
            onChange={handleProvinceChange}
            options={provinces.map((p) => ({ value: String(p.id), label: p.nameTh }))}
            error={fieldErrors.provinceId}
          />
          <SelectField
            label="อำเภอ / เขต"
            placeholder="เลือกอำเภอ / เขต"
            value={address.districtId}
            onChange={handleDistrictChange}
            options={districts.map((d) => ({ value: String(d.id), label: d.nameTh }))}
            disabled={!address.provinceId}
            error={fieldErrors.districtId}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectField
            label="ตำบล / แขวง"
            placeholder="เลือกตำบล / แขวง"
            value={address.subdistrictId}
            onChange={handleSubdistrictChange}
            options={subdistricts.map((s) => ({ value: String(s.id), label: s.nameTh }))}
            disabled={!address.districtId}
            error={fieldErrors.subdistrictId}
          />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-foreground/70">รหัสไปรษณีย์ (กรอกอัตโนมัติ)</label>
            <input readOnly value={address.postalCode} className="h-10 border border-line bg-background px-2 text-sm text-foreground/60" />
          </div>
        </div>
        <TextField label="หมายเหตุสำหรับการจัดส่ง (ถ้ามี)" value={address.deliveryNote} onChange={(v) => setAddress((p) => ({ ...p, deliveryNote: v }))} />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">รายการเสื้อ ({rows.length} ตัว)</legend>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-foreground/50">
                <th className="py-1.5 pr-2 font-medium">#</th>
                <th className="py-1.5 pr-2 font-medium">สี</th>
                <th className="py-1.5 pr-2 font-medium">ไซซ์</th>
                <th className="py-1.5 pr-2 font-medium">ชื่อ</th>
                <th className="py-1.5 pr-2 font-medium">เบอร์</th>
                <th className="py-1.5 font-medium">การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.key} className="border-b border-line/50 align-top">
                  <td className="py-1.5 pr-2 tabular-nums">{index + 1}</td>
                  <td className="py-1.5 pr-2">
                    <select
                      value={row.colorId}
                      onChange={(e) => handleColorChange(row.key, e.target.value)}
                      className="h-9 border border-line bg-background px-1.5 text-sm"
                    >
                      {colorOptions.map((c) => (
                        <option key={c.colorId} value={c.colorId}>
                          {c.colorName}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <select
                      value={row.sizeId}
                      onChange={(e) => handleSizeChange(row.key, e.target.value)}
                      className="h-9 border border-line bg-background px-1.5 text-sm"
                    >
                      {sizesForColor(row.colorId).map((v) => (
                        <option key={v.sizeId} value={v.sizeId}>
                          {v.sizeName}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      value={row.name}
                      onChange={(e) => updateRow(row.key, { name: e.target.value })}
                      maxLength={15}
                      className="h-9 w-28 border border-line bg-background px-1.5 text-sm"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      value={row.number}
                      onChange={(e) => updateRow(row.key, { number: e.target.value })}
                      maxLength={2}
                      inputMode="numeric"
                      className="h-9 w-16 border border-line bg-background px-1.5 text-sm"
                    />
                  </td>
                  <td className="py-1.5">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => duplicateRow(row.key)} className="text-xs underline underline-offset-4">
                        ทำซ้ำ
                      </button>
                      <button type="button" onClick={() => removeRow(row.key)} className="text-xs text-accent underline underline-offset-4">
                        ลบ
                      </button>
                    </div>
                    {rowErrors[row.key] && <p className="mt-1 text-xs text-accent">{rowErrors[row.key]}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={addRow} className="w-fit border border-line px-3 py-1.5 text-xs font-semibold uppercase tracking-wide hover:border-ink">
          + เพิ่มเสื้อ
        </button>
      </fieldset>

      {submitError && (
        <p role="alert" className="border border-accent/40 bg-accent/5 p-2 text-sm text-accent">
          {submitError}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="h-11 flex-1 bg-ink text-sm font-semibold uppercase tracking-wide text-paper transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="h-11 flex-1 border border-line text-sm font-semibold uppercase tracking-wide hover:border-ink"
        >
          ยกเลิก
        </button>
      </div>
    </form>
  );
}

function TextField({
  label,
  value,
  onChange,
  error,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-foreground/70">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-10 border bg-background px-2 text-sm outline-none focus:border-ink ${error ? "border-accent" : "border-line"}`}
      />
      {error && <p className="text-xs text-accent">{error}</p>}
    </div>
  );
}

function SelectField({
  label,
  placeholder,
  value,
  onChange,
  options,
  disabled,
  error,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-foreground/70">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`h-10 border bg-background px-2 text-sm outline-none focus:border-ink disabled:cursor-not-allowed disabled:text-foreground/40 ${error ? "border-accent" : "border-line"}`}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-accent">{error}</p>}
    </div>
  );
}
