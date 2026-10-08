// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { UploadDropzone } from "@/components/meetings/record/UploadDropzone";
import { ACCEPT_ATTRIBUTE } from "@/lib/domain/documents";

const onFiles = vi.fn();
const onLink = vi.fn();
const pdf = new File(["%PDF-1.4"], "deck.pdf", { type: "application/pdf" });

function renderZone(props: Partial<Parameters<typeof UploadDropzone>[0]> = {}) {
  return render(<UploadDropzone label="Briefing Deck" accept={ACCEPT_ATTRIBUTE} onFiles={onFiles} onLink={onLink} {...props} />);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("UploadDropzone", () => {
  it("invites a drop, a browse or a link, in that order", () => {
    renderZone();
    expect(screen.getByText(/Drop a file here, or/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "browse" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "link one that already exists" })).toBeInTheDocument();
    expect(screen.getByLabelText("Upload Briefing Deck")).toHaveAttribute("accept", ACCEPT_ATTRIBUTE);
  });

  it("opens the file picker from the browse button", () => {
    renderZone();
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "browse" }));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("hands over the chosen file, and clears the input so the same file can be chosen again", () => {
    renderZone();
    const input = screen.getByLabelText("Upload Briefing Deck") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pdf] } });
    expect(onFiles).toHaveBeenCalledWith([pdf]);
    expect(input.value).toBe("");
  });

  it("lights up while a file is dragged over it and takes the drop", () => {
    renderZone();
    const zone = screen.getByTestId("upload-dropzone");
    fireEvent.dragOver(zone, { dataTransfer: { files: [pdf], types: ["Files"] } });
    expect(zone).toHaveAttribute("data-over", "true");
    fireEvent.dragLeave(zone);
    expect(zone).not.toHaveAttribute("data-over");
    fireEvent.drop(zone, { dataTransfer: { files: [pdf], types: ["Files"] } });
    expect(onFiles).toHaveBeenCalledWith([pdf]);
    expect(zone).not.toHaveAttribute("data-over");
  });

  it("offers the link path", () => {
    renderZone();
    fireEvent.click(screen.getByRole("button", { name: "link one that already exists" }));
    expect(onLink).toHaveBeenCalledTimes(1);
  });

  it("takes nothing while disabled", () => {
    renderZone({ disabled: true });
    expect(screen.getByRole("button", { name: "browse" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "link one that already exists" })).toBeDisabled();
    fireEvent.drop(screen.getByTestId("upload-dropzone"), { dataTransfer: { files: [pdf], types: ["Files"] } });
    expect(onFiles).not.toHaveBeenCalled();
  });
});
