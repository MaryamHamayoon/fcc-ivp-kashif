import { defaultIdentity, type DemoAccount } from "@/lib/auth/identity";

const account = (id: string, role: DemoAccount["role"]): DemoAccount => ({ id, name: id, email: `${id}@fcc.gov`, role, title: null, bureauCode: null, blurb: "" });

const accounts: DemoAccount[] = [account("dana", "admin"), account("priya", "coordinator"), account("amara", "regional_lead"), account("samuel", "executive")];

describe("defaultIdentity", () => {
  it("signs the reader in as the administrator unless a role is asked for", () => {
    expect(defaultIdentity(accounts)?.id).toBe("dana");
    expect(defaultIdentity(accounts, null)?.id).toBe("dana");
    expect(defaultIdentity(accounts, "executive")?.id).toBe("samuel");
    expect(defaultIdentity(accounts, "coordinator")?.id).toBe("priya");
  });

  it("falls back to the administrator for a role nobody holds, or a word that is not a role", () => {
    expect(defaultIdentity(accounts, "expert")?.id).toBe("dana");
    expect(defaultIdentity(accounts, "root")?.id).toBe("dana");
  });

  it("takes whoever is first when there is no administrator, and nobody when there is nobody", () => {
    expect(defaultIdentity(accounts.slice(1))?.id).toBe("priya");
    expect(defaultIdentity([])).toBeNull();
  });
});
