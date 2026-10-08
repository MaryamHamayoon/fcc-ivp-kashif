// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/shell/ThemeToggle";

describe("ThemeToggle", () => {
  it("switches data-theme on the html element and updates its label", async () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    const button = await screen.findByRole("button", { name: /switch to dark theme/i });
    await userEvent.click(button);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(await screen.findByRole("button", { name: /switch to light theme/i })).toBeInTheDocument();
  });
});
