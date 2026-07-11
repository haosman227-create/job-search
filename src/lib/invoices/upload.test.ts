import { describe, expect, it, vi } from "vitest";
import {
  buildStoragePath,
  performInvoiceUpload,
  validateUploadFile,
  type InvoiceUploadClient,
} from "./upload";

const BIZ = "b1111111-1111-1111-1111-111111111111";
const USER = "u1111111-1111-1111-1111-111111111111";

function fakeFile(name: string, type: string, size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

function stubClient(overrides: Partial<InvoiceUploadClient> = {}) {
  const client = {
    createInvoice: vi.fn(async () => ({ id: "inv-1" })),
    uploadFile: vi.fn(async () => {}),
    setFilePaths: vi.fn(async () => {}),
    deleteInvoice: vi.fn(async () => {}),
    ...overrides,
  };
  return client;
}

describe("validateUploadFile", () => {
  it("accepts photos and PDFs under the size limit", () => {
    expect(validateUploadFile(fakeFile("a.jpg", "image/jpeg"))).toBeNull();
    expect(validateUploadFile(fakeFile("a.pdf", "application/pdf"))).toBeNull();
    expect(validateUploadFile(fakeFile("a.heic", "image/heic"))).toBeNull();
  });

  it("rejects empty, oversized, and wrong-type files", () => {
    expect(validateUploadFile(fakeFile("a.jpg", "image/jpeg", 0))).toMatch(/empty/);
    expect(
      validateUploadFile({ name: "a.jpg", type: "image/jpeg", size: 21 * 1024 * 1024 }),
    ).toMatch(/too large/);
    expect(validateUploadFile(fakeFile("a.zip", "application/zip"))).toMatch(/photo/i);
  });
});

describe("buildStoragePath", () => {
  it("scopes to business/invoice and sanitizes the filename", () => {
    expect(buildStoragePath(BIZ, "inv-1", "my invoice (1).pdf")).toBe(
      `${BIZ}/inv-1/my-invoice-1-.pdf`,
    );
    expect(buildStoragePath(BIZ, "inv-1", "../../etc/passwd")).toBe(
      `${BIZ}/inv-1/etc-passwd`,
    );
    expect(buildStoragePath(BIZ, "inv-1", "🧾.pdf")).toBe(`${BIZ}/inv-1/pdf`);
    expect(buildStoragePath(BIZ, "inv-1", "///")).toBe(`${BIZ}/inv-1/upload`);
  });
});

describe("performInvoiceUpload", () => {
  it("creates the row, stores the file, and records the path", async () => {
    const client = stubClient();
    const result = await performInvoiceUpload(client, {
      businessId: BIZ,
      userId: USER,
      file: fakeFile("receipt.jpg", "image/jpeg"),
    });

    expect(result).toEqual({ ok: true, invoiceId: "inv-1" });
    expect(client.createInvoice).toHaveBeenCalledWith(BIZ, USER);
    expect(client.uploadFile).toHaveBeenCalledWith(
      `${BIZ}/inv-1/receipt.jpg`,
      expect.any(File),
    );
    expect(client.setFilePaths).toHaveBeenCalledWith("inv-1", [
      `${BIZ}/inv-1/receipt.jpg`,
    ]);
    expect(client.deleteInvoice).not.toHaveBeenCalled();
  });

  it("rejects invalid files before touching the database", async () => {
    const client = stubClient();
    const result = await performInvoiceUpload(client, {
      businessId: BIZ,
      userId: USER,
      file: fakeFile("a.zip", "application/zip"),
    });
    expect(result.ok).toBe(false);
    expect(client.createInvoice).not.toHaveBeenCalled();
  });

  it("removes the invoice row when storage fails", async () => {
    const client = stubClient({
      uploadFile: vi.fn(async () => {
        throw new Error("storage down");
      }),
    });
    const result = await performInvoiceUpload(client, {
      businessId: BIZ,
      userId: USER,
      file: fakeFile("receipt.jpg", "image/jpeg"),
    });
    expect(result.ok).toBe(false);
    expect(client.deleteInvoice).toHaveBeenCalledWith("inv-1");
  });

  it("still reports failure when cleanup itself fails", async () => {
    const client = stubClient({
      uploadFile: vi.fn(async () => {
        throw new Error("storage down");
      }),
      deleteInvoice: vi.fn(async () => {
        throw new Error("db down too");
      }),
    });
    const result = await performInvoiceUpload(client, {
      businessId: BIZ,
      userId: USER,
      file: fakeFile("receipt.jpg", "image/jpeg"),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/try again/i);
  });
});
