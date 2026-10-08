// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PreferencesSheet } from "@/components/preferences/PreferencesSheet";
import { ThemeProvider } from "@/components/theme-provider";
import { OPEN_PREFERENCES_EVENT, type PreferencesSection } from "@/lib/preferences/open";
import { PREFERENCES_STORAGE_KEY } from "@/lib/preferences/schema";
import { __resetPreferencesCache } from "@/lib/preferences/store";

function renderPanel() {
  return render(
    <ThemeProvider>
      <PreferencesSheet />
    </ThemeProvider>,
  );
}

/** What the rail's button does: ask for the panel, optionally at a particular group. */
function openPanel(section?: PreferencesSection) {
  fireEvent(window, new CustomEvent(OPEN_PREFERENCES_EVENT, { detail: { section } }));
}

function stored() {
  const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
  return raw === null ? null : (JSON.parse(raw) as Record<string, string>);
}

const root = () => document.documentElement;

beforeEach(() => {
  window.localStorage.clear();
  __resetPreferencesCache();
  for (const attribute of [...root().attributes]) {
    if (attribute.name.startsWith("data-")) root().removeAttribute(attribute.name);
  }
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  __resetPreferencesCache();
});

describe("PreferencesSheet", () => {
  it("opens on the window event with its title and intro", async () => {
    renderPanel();
    expect(screen.queryByRole("dialog")).toBeNull();

    openPanel();

    expect(await screen.findByRole("dialog", { name: "Display & accessibility" })).toBeInTheDocument();
    expect(screen.getByText("Set how the app looks and moves for you. Saved on this device.")).toBeInTheDocument();
  });

  it("focuses the group the caller asked for", async () => {
    renderPanel();
    openPanel("text");

    const group = await screen.findByRole("group", { name: "Text size" });
    await waitFor(() => expect(group).toHaveFocus());
  });

  it("puts every choice on <html> and in storage the moment it is made", async () => {
    renderPanel();
    openPanel();
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("radio", { name: "FCC blue" }));
    expect(root()).toHaveAttribute("data-accent", "navy");

    fireEvent.click(screen.getByRole("radio", { name: "Tinted" }));
    expect(root()).toHaveAttribute("data-surface", "tinted");

    fireEvent.click(screen.getByRole("radio", { name: "Large" }));
    expect(root()).toHaveAttribute("data-text", "large");

    fireEvent.click(screen.getByRole("radio", { name: "Atkinson Hyperlegible" }));
    expect(root()).toHaveAttribute("data-font", "legible");

    fireEvent.click(screen.getByRole("radio", { name: "High" }));
    expect(root()).toHaveAttribute("data-contrast", "high");

    fireEvent.click(screen.getByRole("switch", { name: "Reduce motion" }));
    expect(root()).toHaveAttribute("data-motion", "reduced");

    expect(stored()).toEqual({ accent: "navy", surface: "tinted", text: "large", font: "legible", contrast: "high", motion: "reduced", nav: "floating", collapsed: "no", rail: "dark" });
  });

  it("says what changed, in words, for anyone who cannot see it happen", async () => {
    renderPanel();
    openPanel();
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("radio", { name: "Large" }));
    expect(screen.getByText("Text size: Large")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "FCC blue" }));
    expect(screen.getByText("Color: FCC blue")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Reduce motion" }));
    expect(screen.getByText("Reduce motion: on")).toBeInTheDocument();
  });

  it("hands the light/dark choice to next-themes rather than storing its own", async () => {
    renderPanel();
    openPanel();
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));

    await waitFor(() => expect(window.localStorage.getItem("theme")).toBe("dark"));
    await waitFor(() => expect(root()).toHaveAttribute("data-theme", "dark"));
    expect(screen.getByText("Appearance: Dark")).toBeInTheDocument();
    // Light/dark is next-themes' business; the preferences bundle only ever learns the rail's tone.
    expect(stored()).not.toHaveProperty("theme");
    expect(stored()).not.toHaveProperty("appearance");
  });

  it("opens for a first-time reader with Hybrid and Floating already chosen", async () => {
    renderPanel();
    openPanel();
    await screen.findByRole("dialog");

    expect(screen.getByRole("radio", { name: "Hybrid" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Floating" })).toHaveAttribute("aria-checked", "true");
  });

  it("applies a preset as a whole bundle, appearance included, and reads as current afterwards", async () => {
    renderPanel();
    openPanel();
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("radio", { name: /Easier reading/ }));

    expect(stored()).toEqual({ accent: "green", surface: "soft", text: "large", font: "legible", contrast: "high", motion: "reduced", nav: "floating", collapsed: "no", rail: "dark" });
    expect(root()).toHaveAttribute("data-text", "large");
    expect(root()).toHaveAttribute("data-contrast", "high");
    expect(screen.getByRole("radio", { name: /Easier reading/ })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("radio", { name: /Presentation/ }));

    // The next preset is laid over the defaults, so nothing of the last one survives.
    expect(stored()).toEqual({ accent: "green", surface: "white", text: "large", font: "standard", contrast: "standard", motion: "system", nav: "floating", collapsed: "no", rail: "dark" });
    await waitFor(() => expect(window.localStorage.getItem("theme")).toBe("light"));
  });

  it("offers a hybrid: the rail in the dark theme beside a light page", async () => {
    renderPanel();
    openPanel();
    await screen.findByRole("dialog");

    // Hybrid is where a new reader starts, so leave it first: plain Light takes the rail's tone back to the page's.
    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(root()).not.toHaveAttribute("data-rail");
    expect(stored()?.rail).toBe("match");

    fireEvent.click(screen.getByRole("radio", { name: "Hybrid" }));

    await waitFor(() => expect(window.localStorage.getItem("theme")).toBe("light"));
    expect(root()).toHaveAttribute("data-rail", "dark");
    expect(screen.getByRole("radio", { name: "Hybrid" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Appearance: Hybrid")).toBeInTheDocument();

    // Any other appearance takes the rail back to the theme's own tone.
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    await waitFor(() => expect(window.localStorage.getItem("theme")).toBe("dark"));
    expect(root()).not.toHaveAttribute("data-rail");
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
  });

  it("offers the rail in two styles, standard or floating — collapsing belongs to the rail itself", async () => {
    renderPanel();
    openPanel("nav");
    const group = await screen.findByRole("group", { name: "Navigation" });
    await waitFor(() => expect(group).toHaveFocus());

    expect(within(group).getAllByRole("radio").map((radio) => radio.textContent)).toEqual(["Standard", "Floating"]);

    fireEvent.click(within(group).getByRole("radio", { name: "Standard" }));
    expect(root()).not.toHaveAttribute("data-nav");
    expect(stored()?.nav).toBe("standard");
    expect(screen.getByText("Navigation: Standard")).toBeInTheDocument();

    fireEvent.click(within(group).getByRole("radio", { name: "Floating" }));
    expect(root()).toHaveAttribute("data-nav", "floating");
    expect(stored()?.nav).toBe("floating");
  });

  it("changes the style of a collapsed rail without opening it back up", async () => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ nav: "floating", collapsed: "yes" }));
    __resetPreferencesCache();
    renderPanel();
    openPanel("nav");
    const group = await screen.findByRole("group", { name: "Navigation" });

    fireEvent.click(within(group).getByRole("radio", { name: "Standard" }));

    expect(stored()).toMatchObject({ nav: "standard", collapsed: "yes" });
    expect(root()).not.toHaveAttribute("data-nav");
    expect(root()).toHaveAttribute("data-collapsed", "yes");
  });

  it("keeps the rail where it was when a preset is applied", async () => {
    renderPanel();
    openPanel();
    await screen.findByRole("dialog");

    // Away from the defaults first, so "kept" cannot be mistaken for "reset".
    fireEvent.click(within(screen.getByRole("group", { name: "Navigation" })).getByRole("radio", { name: "Standard" }));
    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    fireEvent.click(screen.getByRole("radio", { name: /Easier reading/ }));

    expect(stored()?.nav).toBe("standard");
    expect(stored()?.rail).toBe("match");
    expect(root()).not.toHaveAttribute("data-nav");
    expect(root()).not.toHaveAttribute("data-rail");
    expect(screen.getByRole("radio", { name: /Easier reading/ })).toHaveAttribute("aria-checked", "true");
  });

  it("resets everything, in storage and on the page", async () => {
    renderPanel();
    openPanel();
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("radio", { name: "Extra large" }));
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    await waitFor(() => expect(window.localStorage.getItem("theme")).toBe("dark"));

    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));

    expect(window.localStorage.getItem(PREFERENCES_STORAGE_KEY)).toBeNull();
    expect(root()).not.toHaveAttribute("data-text");
    // "Defaults" means the look a new reader gets: hybrid, with the rail floating.
    expect(root()).toHaveAttribute("data-nav", "floating");
    expect(root()).toHaveAttribute("data-rail", "dark");
    await waitFor(() => expect(window.localStorage.getItem("theme")).toBe("light"));
    expect(screen.getByText("Everything is back to the standard look.")).toBeInTheDocument();
  });

  it("closes on Escape and hands focus back to whatever opened it", async () => {
    renderPanel();
    const opener = document.createElement("button");
    opener.textContent = "Display & accessibility";
    document.body.append(opener);
    opener.focus();

    try {
      openPanel();
      const dialog = await screen.findByRole("dialog");

      fireEvent.keyDown(dialog, { key: "Escape" });

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await waitFor(() => expect(opener).toHaveFocus());
    } finally {
      opener.remove();
    }
  });

  it("closes on Done", async () => {
    renderPanel();
    openPanel();
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
