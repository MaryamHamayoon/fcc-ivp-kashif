// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PreferencesSheet } from "@/components/preferences/PreferencesSheet";
import { ThemeProvider } from "@/components/theme-provider";
import { OPEN_PREFERENCES_EVENT } from "@/lib/preferences/open";
import { __resetPreferencesCache } from "@/lib/preferences/store";
import { expectNoViolations } from "./axe";

function openPanel() {
  fireEvent(window, new CustomEvent(OPEN_PREFERENCES_EVENT, { detail: {} }));
}

beforeEach(() => {
  window.localStorage.clear();
  __resetPreferencesCache();
  for (const attribute of [...document.documentElement.attributes]) {
    if (attribute.name.startsWith("data-")) document.documentElement.removeAttribute(attribute.name);
  }
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  __resetPreferencesCache();
});

describe("display & accessibility panel accessibility", () => {
  it("carries no WCAG violations when it opens", async () => {
    render(
      <ThemeProvider>
        <PreferencesSheet />
      </ThemeProvider>,
    );
    openPanel();
    await screen.findByRole("dialog");

    await expectNoViolations(document.body);
  });

  it("still carries none once the reader has changed the app underneath it", async () => {
    render(
      <ThemeProvider>
        <PreferencesSheet />
      </ThemeProvider>,
    );
    openPanel();
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("radio", { name: /Easier reading/ }));
    fireEvent.click(screen.getByRole("radio", { name: "FCC blue" }));
    fireEvent.click(screen.getByRole("switch", { name: "Reduce motion" }));

    await expectNoViolations(document.body);
  });
});
