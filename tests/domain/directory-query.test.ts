import { DIRECTORY_PAGE_SIZE, pageSlice, readDirectoryQuery } from "@/lib/domain/directory-query";

describe("readDirectoryQuery", () => {
  it("opens on the experts, most engaged first, a page of twenty-five", () => {
    expect(readDirectoryQuery({})).toEqual({ tab: "experts", q: "", bureauCode: "", sort: "engagements", page: 1, pageSize: DIRECTORY_PAGE_SIZE });
    expect(DIRECTORY_PAGE_SIZE).toBe(25);
  });

  it("reads what the toolbar and the pager write", () => {
    expect(readDirectoryQuery({ tab: "organizations", q: "  ofcom ", bureauCode: " SB ", sort: "name", page: "3", pageSize: "50" })).toEqual({
      tab: "organizations",
      q: "ofcom",
      bureauCode: "SB",
      sort: "name",
      page: 3,
      pageSize: 50,
    });
  });

  it("shrugs off anything it did not write", () => {
    const read = readDirectoryQuery({ tab: "people", sort: "height", page: "0", pageSize: "7" });
    expect(read).toMatchObject({ tab: "experts", sort: "engagements", page: 1, pageSize: 25 });
    expect(readDirectoryQuery({ page: "2.5", pageSize: "lots" })).toMatchObject({ page: 1, pageSize: 25 });
    // Next hands a repeated key over as an array; the first value is the one that counts.
    expect(readDirectoryQuery({ bureauCode: ["EB", "SB"], page: ["2", "9"] })).toMatchObject({ bureauCode: "EB", page: 2 });
  });
});

describe("pageSlice", () => {
  const rows = Array.from({ length: 73 }, (_, i) => i + 1);

  it("cuts one page out of a list and says how many there are in all", () => {
    expect(pageSlice(rows, 1, 25)).toEqual({ items: rows.slice(0, 25), total: 73, page: 1, pageSize: 25 });
    expect(pageSlice(rows, 3, 25)).toEqual({ items: rows.slice(50), total: 73, page: 3, pageSize: 25 });
  });

  it("lands on the last page when asked for one past the end, as after a filter shortens the list", () => {
    expect(pageSlice(rows, 9, 25)).toMatchObject({ page: 3, items: rows.slice(50) });
    expect(pageSlice(rows, -4, 25)).toMatchObject({ page: 1 });
  });

  it("is one empty page when there is nothing to show", () => {
    expect(pageSlice([], 2, 25)).toEqual({ items: [], total: 0, page: 1, pageSize: 25 });
  });
});
