// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { type BrowserPref, browserPref } from "@/lib/browser-pref";

type Tone = "calm" | "loud";
let n = 0;
/** A fresh preference per test, under its own key, so no test inherits another's value. */
const fresh = (): { key: string; pref: BrowserPref<Tone> } => {
  const key = `ivp.test.tone.${++n}`;
  return { key, pref: browserPref<Tone>(key, ["calm", "loud"], "calm") };
};

function Probe({ pref }: { pref: BrowserPref<Tone> }) {
  return <output data-testid="tone">{pref.useValue()}</output>;
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("browserPref", () => {
  it("reads the fallback when nothing is stored, and a stored value when one is", () => {
    const empty = fresh();
    expect(empty.pref.get()).toBe("calm");

    const stored = fresh();
    window.localStorage.setItem(stored.key, "loud");
    render(<Probe pref={stored.pref} />);
    expect(screen.getByTestId("tone")).toHaveTextContent("loud");
  });

  it("ignores a stored value it does not know", () => {
    const { key, pref } = fresh();
    window.localStorage.setItem(key, "shouting");
    expect(pref.get()).toBe("calm");
  });

  it("writes through to storage and re-renders every reader", () => {
    const { key, pref } = fresh();
    render(
      <>
        <Probe pref={pref} />
        <Probe pref={pref} />
      </>,
    );
    act(() => pref.set("loud"));
    expect(window.localStorage.getItem(key)).toBe("loud");
    expect(screen.getAllByTestId("tone").map((el) => el.textContent)).toEqual(["loud", "loud"]);
  });

  it("follows a change made in another tab, and only under its own key", () => {
    const { key, pref } = fresh();
    render(<Probe pref={pref} />);

    act(() => {
      window.localStorage.setItem("ivp.test.other", "loud");
      window.dispatchEvent(new StorageEvent("storage", { key: "ivp.test.other", newValue: "loud" }));
    });
    expect(screen.getByTestId("tone")).toHaveTextContent("calm");

    act(() => {
      window.localStorage.setItem(key, "loud");
      window.dispatchEvent(new StorageEvent("storage", { key, newValue: "loud" }));
    });
    expect(screen.getByTestId("tone")).toHaveTextContent("loud");
  });

  it("keeps working when storage is blocked: the choice lasts the session", () => {
    const { pref } = fresh();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    render(<Probe pref={pref} />);
    expect(screen.getByTestId("tone")).toHaveTextContent("calm");
    act(() => pref.set("loud"));
    expect(screen.getByTestId("tone")).toHaveTextContent("loud");
  });

  it("renders the fallback on the server, whatever the browser holds", () => {
    const { key, pref } = fresh();
    window.localStorage.setItem(key, "loud");
    expect(renderToString(<Probe pref={pref} />)).toContain(">calm<");
  });
});
