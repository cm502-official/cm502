import { beforeEach, describe, expect, it, vi } from "vitest";

// next/navigation's redirect() throws a special control-flow error in a
// real Next.js request — mocked here to throw a plain, inspectable error
// instead, so the test can assert "redirected" without a full Next.js
// runtime.
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const getUserMock = vi.fn();
const signOutMock = vi.fn();
const adminUsersSingleMock = vi.fn();
const supabaseClientMock = {
  auth: { getUser: getUserMock, signOut: signOutMock },
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: adminUsersSingleMock,
  })),
};
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => supabaseClientMock),
}));

const { requireAdminUser, getAdminUserOrNull } = await import("./require-admin");

beforeEach(() => {
  redirectMock.mockClear();
  getUserMock.mockReset();
  signOutMock.mockReset();
  adminUsersSingleMock.mockReset();
});

describe("requireAdminUser — the real /admin authorization gate", () => {
  it("redirects to /admin/login when there is no authenticated user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    await expect(requireAdminUser()).rejects.toThrow("REDIRECT:/admin/login");
    expect(redirectMock).toHaveBeenCalledWith("/admin/login");
  });

  it("redirects (and signs out) when the authenticated user has no admin_users row", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    adminUsersSingleMock.mockResolvedValue({ data: null });
    await expect(requireAdminUser()).rejects.toThrow("REDIRECT:/admin/login?error=not_authorized");
    expect(signOutMock).toHaveBeenCalled();
  });

  it("redirects when the admin_users row exists but is inactive", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    adminUsersSingleMock.mockResolvedValue({
      data: { id: "user-1", full_name: "Staff", role: "staff", is_active: false },
    });
    await expect(requireAdminUser()).rejects.toThrow("REDIRECT:/admin/login?error=not_authorized");
  });

  it("returns the admin user when active", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    adminUsersSingleMock.mockResolvedValue({
      data: { id: "user-1", full_name: "Jane Staff", role: "admin", is_active: true },
    });
    const result = await requireAdminUser();
    expect(result).toEqual({ id: "user-1", fullName: "Jane Staff", role: "admin" });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe("getAdminUserOrNull — the API-route variant (no redirect)", () => {
  it("returns null when there is no authenticated user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    expect(await getAdminUserOrNull()).toBeNull();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("returns null when the user has no admin_users row", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    adminUsersSingleMock.mockResolvedValue({ data: null });
    expect(await getAdminUserOrNull()).toBeNull();
  });

  it("returns null when the admin_users row is inactive", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    adminUsersSingleMock.mockResolvedValue({
      data: { id: "user-1", full_name: "Staff", role: "staff", is_active: false },
    });
    expect(await getAdminUserOrNull()).toBeNull();
  });

  it("returns the admin user when active", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    adminUsersSingleMock.mockResolvedValue({
      data: { id: "user-1", full_name: "Jane Staff", role: "admin", is_active: true },
    });
    expect(await getAdminUserOrNull()).toEqual({ id: "user-1", fullName: "Jane Staff", role: "admin" });
  });
});
