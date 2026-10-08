// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import AppError from "@/app/(app)/error";
import Forbidden from "@/app/(app)/forbidden/page";
import AppNotFound from "@/app/(app)/not-found";
import RootError from "@/app/error";
import RootNotFound from "@/app/not-found";
import { expectNoViolations } from "./axe";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/meetings/nope",
}));

const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

afterEach(cleanup);
afterAll(() => consoleError.mockRestore());

const boom = Object.assign(new Error("Meeting lookup failed"), { digest: "abc123" });

describe("error and empty page accessibility", () => {
  it("both not-found pages carry no WCAG violations and name themselves once at level 1", async () => {
    const { container, unmount } = render(<RootNotFound />);
    await expectNoViolations(container);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    unmount();

    const app = render(<AppNotFound />);
    await expectNoViolations(app.container);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("the forbidden page names itself at level 1 and carries no WCAG violations", async () => {
    const { container } = render(<Forbidden />);
    await expectNoViolations(container);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your role can't open that");
  });

  it("both error pages carry no WCAG violations and offer a retry", async () => {
    const reset = vi.fn();
    const { container, unmount } = render(<RootError error={boom} reset={reset} />);
    await expectNoViolations(container);
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    unmount();

    const app = render(<AppError error={boom} reset={reset} />);
    await expectNoViolations(app.container);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
