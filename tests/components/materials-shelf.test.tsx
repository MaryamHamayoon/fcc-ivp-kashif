// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MaterialsShelf } from "@/components/dossier/MaterialsShelf";
import type { Material } from "@/lib/domain/dossier";

afterEach(cleanup);

const material = (id: string, over: Partial<Material> = {}): Material => ({ id, title: `Document ${id}`, kind: "briefing_deck", kindLabel: "Briefing Deck", meetingId: "mtg_1", meetingCode: "IVP-2026-041", reusable: false, addedAt: new Date("2026-08-20T15:30:00Z"), preview: "pdf", scheme: "seed", mime: "application/pdf", ...over });

const materials = [material("a", { title: "Spectrum sharing — FCC briefing deck", reusable: true }), material("b", { title: "Delegation list", kind: "participant_list", kindLabel: "Participant List", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), material("c", { title: "Agenda", kind: "agenda_final", kindLabel: "Final Agenda", meetingCode: "IVP-2026-012" })];

describe("MaterialsShelf", () => {
  it("shelves each document with its kind and meeting, marks the reusable ones, and leads to the rest", () => {
    render(<MaterialsShelf materials={materials} total={14} href="/documents?countryCode=KE" subject="Kenya" onOpen={vi.fn()} />);
    const rows = within(screen.getByRole("list", { name: "Materials" })).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Spectrum sharing — FCC briefing deck");
    expect(rows[0]).toHaveTextContent("Briefing Deck · IVP-2026-041");
    expect(within(rows[0]!).getByText("Reusable")).toBeInTheDocument();
    expect(within(rows[1]!).queryByText("Reusable")).toBeNull();
    expect(rows[2]).toHaveTextContent("Final Agenda · IVP-2026-012");
    const all = screen.getByRole("link", { name: /All materials for Kenya/ });
    expect(all).toHaveAttribute("href", "/documents?countryCode=KE");
    expect(all).toHaveTextContent("14");
  });

  it("opens a document from its title and says which control opened it", async () => {
    const onOpen = vi.fn();
    render(<MaterialsShelf materials={materials} total={3} href="/documents?orgId=ofcom" subject="Ofcom" onOpen={onOpen} />);
    const title = screen.getByRole("button", { name: "Delegation list" });
    await userEvent.click(title);
    expect(onOpen).toHaveBeenCalledWith("b", title);
  });

  it("says so when the shelf is empty", () => {
    render(<MaterialsShelf materials={[]} total={0} href="/documents?orgId=ofcom" subject="Ofcom" onOpen={vi.fn()} />);
    expect(screen.getByText("No materials on file yet.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
