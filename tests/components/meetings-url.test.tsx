// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { readPage, readPageSize, useMeetingsUrl } from "@/components/meetings/useMeetingsQuery";
import { DEFAULT_PAGE_SIZE, MEETINGS_PAGE_SIZE } from "@/lib/url-state";

const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, prefetch: vi.fn() }),
  usePathname: () => "/meetings",
  useSearchParams: () => new URLSearchParams(search),
}));

beforeEach(() => {
  replace.mockReset();
  search = "";
});

const written = () => replace.mock.calls.at(-1)?.[0] as string;

describe("the meetings page size", () => {
  it("is 25 when the URL says nothing, and Activity and Documents stay at 50", () => {
    expect(MEETINGS_PAGE_SIZE).toBe(25);
    expect(readPageSize(new URLSearchParams())).toBe(25);
    expect(readPageSize(new URLSearchParams("pageSize=100"))).toBe(100);
    expect(readPageSize(new URLSearchParams("pageSize=9999"))).toBe(200);
    expect(DEFAULT_PAGE_SIZE).toBe(50);
  });

  it("reads a page as a whole number from 1, else the first page", () => {
    expect(readPage(new URLSearchParams("page=4"))).toBe(4);
    for (const bad of ["page=0", "page=-2", "page=1.5", "page=abc", ""]) expect(readPage(new URLSearchParams(bad))).toBe(1);
  });
});

describe("useMeetingsUrl", () => {
  it("setFilter returns to page one but keeps the reader's page size", () => {
    search = "page=3&pageSize=100&status=confirmed";
    const { result } = renderHook(() => useMeetingsUrl());
    act(() => result.current.setFilter({ regionId: "af" }));
    const next = new URLSearchParams(written().split("?")[1]);
    expect(next.get("regionId")).toBe("af");
    expect(next.get("pageSize")).toBe("100");
    expect(next.has("page")).toBe(false);
  });

  it("hrefFor resets the page and keeps the page size", () => {
    search = "page=3&pageSize=50";
    const { result } = renderHook(() => useMeetingsUrl());
    const next = new URLSearchParams(result.current.hrefFor({ view: "completed" }).split("?")[1]);
    expect(next.get("view")).toBe("completed");
    expect(next.get("pageSize")).toBe("50");
    expect(next.has("page")).toBe(false);
  });

  it("hrefForPage links a page, and page one has no page in its URL", () => {
    search = "q=ghana&pageSize=50";
    const { result } = renderHook(() => useMeetingsUrl());
    expect(result.current.hrefForPage(3)).toBe("/meetings?q=ghana&pageSize=50&page=3");
    expect(result.current.hrefForPage(1)).toBe("/meetings?q=ghana&pageSize=50");
  });

  it("setPageSize writes nothing for the default, the size otherwise, and forgets the page", () => {
    search = "page=4";
    const { result } = renderHook(() => useMeetingsUrl());
    act(() => result.current.setPageSize(MEETINGS_PAGE_SIZE));
    expect(written()).toBe("/meetings");
    act(() => result.current.setPageSize(100));
    expect(written()).toBe("/meetings?pageSize=100");
  });

  it("a sort written through setParams with page: null goes back to page one", () => {
    search = "page=3&pageSize=50&sort=date";
    const { result } = renderHook(() => useMeetingsUrl());
    act(() => result.current.setParams({ sort: "country", dir: "asc", page: null }));
    const next = new URLSearchParams(written().split("?")[1]);
    expect(next.get("sort")).toBe("country");
    expect(next.get("pageSize")).toBe("50");
    expect(next.has("page")).toBe(false);
  });
});
