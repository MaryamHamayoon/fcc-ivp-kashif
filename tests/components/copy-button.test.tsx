// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CopyButton } from "@/components/common/CopyButton";

const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  vi.useFakeTimers();
  writeText.mockReset();
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Lets the clipboard's promise settle under fake timers. */
const settle = () => act(async () => void (await Promise.resolve()));

describe("CopyButton", () => {
  it("puts the value on the clipboard and says so, to the eye and to a screen reader", async () => {
    writeText.mockResolvedValue();
    render(<CopyButton value="tomas.lindqvist@fcc.gov" what="email address" />);

    const button = screen.getByRole("button", { name: "Copy email address" });
    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    fireEvent.click(button);
    await settle();

    expect(writeText).toHaveBeenCalledWith("tomas.lindqvist@fcc.gov");
    expect(screen.getByRole("button", { name: "Copied email address" })).toBe(button);
    expect(screen.getByRole("status")).toHaveTextContent("Email address copied");
  });

  it("goes back to offering the copy after a moment", async () => {
    writeText.mockResolvedValue();
    render(<CopyButton value="(202) 418-1234" what="phone number" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy phone number" }));
    await settle();
    expect(screen.getByRole("button", { name: "Copied phone number" })).toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(2500));
    expect(screen.getByRole("button", { name: "Copy phone number" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("says what to do instead when the browser refuses the clipboard", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    render(<CopyButton value="tomas.lindqvist@fcc.gov" what="email address" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy email address" }));
    await settle();
    await settle();

    expect(screen.getByRole("status")).toHaveTextContent("Could not copy. Select the email address and copy it by hand.");
    expect(screen.getByRole("button", { name: "Copy email address" })).toBeInTheDocument();
  });

  it("as an icon alone, keeps its name and still reports the copy", async () => {
    writeText.mockResolvedValue();
    render(<CopyButton iconOnly value="tomas.lindqvist@fcc.gov" what="email address" whose="Tomas Lindqvist" />);

    const button = screen.getByRole("button", { name: "Copy email address for Tomas Lindqvist" });
    expect(button).toHaveAttribute("title", "Copy email address for Tomas Lindqvist");
    fireEvent.click(button);
    await settle();

    expect(screen.getByRole("button", { name: "Copy email address for Tomas Lindqvist" })).toBe(button);
    expect(screen.getByRole("status")).toHaveTextContent("Email address copied");
  });
});
