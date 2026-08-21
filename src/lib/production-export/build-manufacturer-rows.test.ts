import { describe, expect, it } from "vitest";
import {
  buildManufacturerRows,
  collectManufacturerExportErrors,
  formatManufacturerRowsAsCsv,
  MANUFACTURER_COLUMN_HEADERS,
  type ManufacturerOrderInput,
} from "./build-manufacturer-rows";
import { formatManufacturerAddress } from "./build-manufacturer-address";

function order(overrides: Partial<ManufacturerOrderInput> & { orderNumber: string }): ManufacturerOrderInput {
  return {
    items: [],
    recipient: "",
    phone: "",
    address: "",
    ...overrides,
  };
}

describe("buildManufacturerRows — Test A: one order, 2 shirts", () => {
  const orders: ManufacturerOrderInput[] = [
    order({
      orderNumber: "CM502-A",
      recipient: "Nachanok Example",
      phone: "0812345678",
      address: "Chiang Mai address",
      items: [
        { colorNameSnapshot: "black", sizeNameSnapshot: "8XL", quantity: 1, customizations: [{ name: "Nachanok", number: "22" }] },
        { colorNameSnapshot: "black", sizeNameSnapshot: "2XL", quantity: 1, customizations: [{ name: "KORKOR", number: "10" }] },
      ],
    }),
  ];

  it("puts recipient/phone/address only on the first shirt row", () => {
    const { rows } = buildManufacturerRows(orders);
    expect(rows).toEqual([
      { sequence: 1, color: "black", size: "8XL", name: "Nachanok", number: "22", recipient: "Nachanok Example", phone: "0812345678", address: "Chiang Mai address" },
      { sequence: 2, color: "black", size: "2XL", name: "KORKOR", number: "10", recipient: "", phone: "", address: "" },
    ]);
  });
});

describe("buildManufacturerRows — Test B: one order, 30 shirts", () => {
  it("creates 30 rows with the address only on row 1", () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      colorNameSnapshot: "black",
      sizeNameSnapshot: "M",
      quantity: 1,
      customizations: [{ name: `NAME${i}`, number: String(i) }],
    }));
    const { rows } = buildManufacturerRows([
      order({ orderNumber: "CM502-B", recipient: "Big Order", phone: "0899999999", address: "Address B", items }),
    ]);

    expect(rows).toHaveLength(30);
    expect(rows[0].address).toBe("Address B");
    expect(rows[0].recipient).toBe("Big Order");
    expect(rows[0].phone).toBe("0899999999");
    for (let i = 1; i < 30; i++) {
      expect(rows[i].address).toBe("");
      expect(rows[i].recipient).toBe("");
      expect(rows[i].phone).toBe("");
    }
    expect(rows.map((r) => r.sequence)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });
});

describe("buildManufacturerRows — Test C: multiple orders, continuous numbering", () => {
  const orders: ManufacturerOrderInput[] = [
    order({
      orderNumber: "CM502-A",
      recipient: "Order A",
      phone: "0810000000",
      address: "Address A",
      items: [
        { colorNameSnapshot: "black", sizeNameSnapshot: "M", quantity: 1, customizations: [{ name: "N1", number: "1" }] },
        { colorNameSnapshot: "black", sizeNameSnapshot: "L", quantity: 1, customizations: [{ name: "N2", number: "2" }] },
        { colorNameSnapshot: "black", sizeNameSnapshot: "XL", quantity: 1, customizations: [{ name: "N3", number: "3" }] },
      ],
    }),
    order({
      orderNumber: "CM502-B",
      recipient: "Order B",
      phone: "0820000000",
      address: "Address B",
      items: [
        { colorNameSnapshot: "pink", sizeNameSnapshot: "L", quantity: 1, customizations: [{ name: "N4", number: "4" }] },
        { colorNameSnapshot: "pink", sizeNameSnapshot: "L", quantity: 1, customizations: [{ name: "N5", number: "5" }] },
      ],
    }),
  ];

  it("rows 1-3 belong to A (address only row 1), rows 4-5 belong to B (address only row 4)", () => {
    const { rows } = buildManufacturerRows(orders);
    expect(rows.map((r) => r.sequence)).toEqual([1, 2, 3, 4, 5]);

    expect(rows[0].address).toBe("Address A");
    expect(rows[1].address).toBe("");
    expect(rows[2].address).toBe("");

    expect(rows[3].address).toBe("Address B");
    expect(rows[4].address).toBe("");
  });
});

describe("buildManufacturerRows — Test D: no address leakage between orders", () => {
  it("Order A's address never appears on an Order B shirt row", () => {
    const orders: ManufacturerOrderInput[] = [
      order({
        orderNumber: "CM502-A",
        recipient: "Order A",
        phone: "0810000000",
        address: "ADDRESS-ONLY-A",
        items: [
          { colorNameSnapshot: "black", sizeNameSnapshot: "M", quantity: 1, customizations: [{ name: "N1", number: "1" }] },
          { colorNameSnapshot: "black", sizeNameSnapshot: "L", quantity: 1, customizations: [{ name: "N2", number: "2" }] },
        ],
      }),
      order({
        orderNumber: "CM502-B",
        recipient: "Order B",
        phone: "0820000000",
        address: "ADDRESS-ONLY-B",
        items: [{ colorNameSnapshot: "pink", sizeNameSnapshot: "L", quantity: 1, customizations: [{ name: "N3", number: "3" }] }],
      }),
    ];
    const { rows } = buildManufacturerRows(orders);
    const bRows = rows.slice(2);
    expect(bRows.every((r) => r.address !== "ADDRESS-ONLY-A")).toBe(true);
    expect(bRows[0].address).toBe("ADDRESS-ONLY-B");
  });
});

describe("buildManufacturerRows — Test E: exact headers", () => {
  it("CSV headers are exactly #, Color, Size, Name, Number, Recipient, Phone, Address — nothing else", () => {
    expect(MANUFACTURER_COLUMN_HEADERS).toEqual(["#", "Color", "Size", "Name", "Number", "Recipient", "Phone", "Address"]);

    const { rows } = buildManufacturerRows([
      order({
        orderNumber: "CM502-A",
        recipient: "R",
        phone: "P",
        address: "A",
        items: [{ colorNameSnapshot: "black", sizeNameSnapshot: "M", quantity: 1, customizations: [{ name: "N", number: "1" }] }],
      }),
    ]);
    const csv = formatManufacturerRowsAsCsv(rows);
    const headerLine = csv.split("\n")[0];
    expect(headerLine).toBe("#,Color,Size,Name,Number,Recipient,Phone,Address");
  });

  it("RFC 4180-quotes a two-line Address field in CSV instead of corrupting the row structure", () => {
    const { rows } = buildManufacturerRows([
      order({
        orderNumber: "CM502-A",
        recipient: "R",
        phone: "P",
        address: "Line 1\nLine 2",
        items: [{ colorNameSnapshot: "black", sizeNameSnapshot: "M", quantity: 1, customizations: [{ name: "N", number: "1" }] }],
      }),
    ]);
    const csv = formatManufacturerRowsAsCsv(rows);
    expect(csv).toBe('#,Color,Size,Name,Number,Recipient,Phone,Address\n1,black,M,N,1,R,P,"Line 1\nLine 2"');
  });
});

describe("buildManufacturerRows — validation passthrough", () => {
  it("still flags a forbidden '/' in a customization, attributed to the right order", () => {
    const orders: ManufacturerOrderInput[] = [
      order({ orderNumber: "CM502-A", items: [{ colorNameSnapshot: "black", sizeNameSnapshot: "M", quantity: 1, customizations: [{ name: "Bad/Name", number: "1" }] }] }),
    ];
    const { perOrder } = buildManufacturerRows(orders);
    const blocked = collectManufacturerExportErrors(perOrder);
    expect(blocked).toHaveLength(1);
    expect(blocked[0].orderNumber).toBe("CM502-A");
  });

  it("does not include an order with zero rows in perOrder row output, but still lists it", () => {
    const { rows, perOrder } = buildManufacturerRows([order({ orderNumber: "CM502-EMPTY", items: [] })]);
    expect(rows).toEqual([]);
    expect(perOrder).toEqual([{ orderNumber: "CM502-EMPTY", rowCount: 0, errors: [] }]);
  });
});

describe("buildManufacturerRows — a real two-line formatManufacturerAddress() output flows through unchanged", () => {
  it("keeps the embedded newline intact on the first row and still leaves it blank on later rows", () => {
    const twoLineAddress = formatManufacturerAddress({
      addressLine: "123/45",
      soiRoad: null,
      subdistrict: "สุเทพ",
      district: "เมืองเชียงใหม่",
      province: "เชียงใหม่",
      postalCode: "50200",
      deliveryNote: null,
    });
    const { rows } = buildManufacturerRows([
      order({
        orderNumber: "CM502-A",
        recipient: "Nachanok",
        phone: "0812345678",
        address: twoLineAddress,
        items: [
          { colorNameSnapshot: "black", sizeNameSnapshot: "8XL", quantity: 1, customizations: [{ name: "Nachanok", number: "22" }] },
          { colorNameSnapshot: "black", sizeNameSnapshot: "2XL", quantity: 1, customizations: [{ name: "KORKOR", number: "10" }] },
        ],
      }),
    ]);
    expect(rows[0].address).toBe("123/45\nต.สุเทพ อ.เมืองเชียงใหม่ จ.เชียงใหม่ 50200");
    expect(rows[0].address.split("\n")).toHaveLength(2);
    expect(rows[1].address).toBe("");
  });
});
