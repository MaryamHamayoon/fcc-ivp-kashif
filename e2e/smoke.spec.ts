import { expect, type Locator, type Page, test } from "@playwright/test";
import { describeFocus } from "./helpers";

/**
 * The lifecycle, end to end, against a production build whose database lives only in the
 * server process: sign in, read the dashboard, reach intake from the keyboard alone, file a
 * request, log what happened to it, move it on, and find it again in the list. Then the same
 * program as an executive sees it — everything to read, nothing to file.
 *
 * Every assertion is about the meeting this run created. Nothing here edits, moves or counts a
 * seeded row, so the suite stays honest whichever IVP instance it is pointed at.
 */

test.describe.configure({ mode: "serial" });

/** A title no other row can collide with, even across two runs in the same minute. */
const stamp = (): string => new Date().toISOString().replace(/[:.]/g, "-");

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The record the coordinator files; the executive test reads it back, so it lives outside either test. */
let recordUrl = "";

/**
 * A one-page PDF built by hand, so the upload is a real file with a real structure rather than a
 * buffer that merely starts with the magic bytes. ASCII only: a PDF string literal is not UTF-8.
 */
function minimalPdf(text: string): Buffer {
  const content = `BT /F1 18 Tf 72 720 Td (${text.replace(/[\\()]/g, "\\$&")}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** `datetime-local` wants a wall clock; the wizard reads it as Washington time. */
function wallClock(daysFromNow: number, hour: number): string {
  const date = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(hour)}:00`;
}

/**
 * Signs in by accepting the system-use notice, exactly as a person would — the proxy, the server
 * action and the session cookie are all exercised before the first assertion. The screen signs
 * the administrator in; `?as=<role>` asks for the first account in another role instead.
 */
async function signInAs(page: Page, role: string): Promise<void> {
  await page.goto(`/login?as=${role}`);
  const accept = page.getByRole("button", { name: "Accept and sign in" });
  await accept.waitFor({ state: "visible" });
  await accept.click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/**
 * Every radio in IVP is a visually hidden input inside the card or chip a person actually
 * clicks, so the label is the honest target; the assertion afterwards proves the click landed.
 */
async function chooseRadio(page: Page, name: string): Promise<void> {
  const radio = page.getByRole("radio", { name, exact: true });
  await page
    .locator("label")
    .filter({ has: radio })
    .first()
    .click();
  await expect(radio).toBeChecked();
}

/** Tab forward from wherever focus sits until `target` has it, or say where focus went instead. */
async function tabTo(page: Page, target: Locator, limit = 30): Promise<void> {
  const trail: string[] = [];
  for (let step = 0; step < limit; step += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) return;
    trail.push(await describeFocus(page));
  }
  throw new Error(`Never reached the target in ${limit} tabs; focus went:\n  ${trail.join("\n  ")}`);
}

test("a coordinator files a meeting, logs what happened and moves it on", async ({ page }) => {
  const title = `Smoke test — ${stamp()}`;
  const waitingOnWho = "Communications Authority of Kenya POC";

  await signInAs(page, "coordinator");

  /* ---- the dashboard answers the five-second question ---------------------- */

  for (const stat of ["engagements", "countries", "participants", "upcoming"]) {
    await expect(page.locator(`[data-stat="${stat}"]`), `program band figure "${stat}"`).toBeVisible();
  }
  await expect(page.getByRole("region", { name: "Upcoming meetings" })).toBeVisible();

  /* ---- keyboard only: the skip link, then intake --------------------------- */

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" }), "the first tab stop must be the skip link").toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main"), "Enter on the skip link must land focus on the main landmark").toBeFocused();

  // A desktop has no top bar, so intake is reached by walking the rail and into the page —
  // a fresh forward walk from the top of the document rather than a reverse one out of the body.
  await page.goto("/");
  const newMeeting = page.getByRole("link", { name: "New meeting", exact: true });
  await tabTo(page, newMeeting, 40);
  await page.keyboard.press("Enter");
  await page.waitForURL("**/meetings/new");

  /* ---- the six-step wizard -------------------------------------------------- */

  await expect(page.getByRole("heading", { name: "Requestor", level: 2 })).toBeVisible();
  await expect(page.getByText("Step 1 of 6")).toBeVisible();

  // Exact, because a topic chip called "ATSC 3.0 / NextGen TV" answers to "Next" otherwise.
  const next = page.getByRole("button", { name: "Next", exact: true });

  await page.getByLabel("Full name").fill("Amara Okonkwo");
  await page.getByLabel("Organization", { exact: true }).fill("Communications Authority of Kenya");
  await page.getByLabel("Kind of organization").selectOption({ label: "Regulator" });
  await page.getByLabel("Email", { exact: true }).fill("amara.okonkwo@smoke.example");
  await next.click();

  // Country & lead — the region follows the first country, so only the picker is touched.
  await expect(page.getByRole("heading", { name: "Country & lead", level: 2 })).toBeVisible();
  await page.getByPlaceholder("Search by country name or code").fill("Kenya");
  await page.getByRole("option", { name: /Kenya/ }).first().click();
  await expect(page.getByRole("list", { name: "Chosen countries" })).toContainText("Kenya");
  await expect(page.getByLabel("Region"), "the region must derive itself from the first country").not.toHaveValue("");
  await next.click();

  // Delegation & topics — rank one is what decides which bureau is asked for a briefer.
  await expect(page.getByRole("heading", { name: "Delegation & topics", level: 2 })).toBeVisible();
  await page.getByLabel("Meeting title").fill(title);
  await page.getByLabel("Delegation size").fill("6");
  await page.getByRole("group", { name: "Available topics" }).getByRole("button").first().click();
  await expect(page.getByRole("list", { name: /^Chosen topics/ }).getByRole("listitem")).toHaveCount(1);
  await next.click();

  await expect(page.getByRole("heading", { name: "Dates & format", level: 2 })).toBeVisible();
  await page.getByLabel("Preferred start").fill(wallClock(45, 10));
  await chooseRadio(page, "In person");
  await next.click();

  // Nothing on Logistics is required; a request can be filed before the room is known.
  await expect(page.getByRole("heading", { name: "Logistics", level: 2 })).toBeVisible();
  await next.click();

  await expect(page.getByRole("heading", { name: "Review", level: 2 })).toBeVisible();
  await page.getByRole("button", { name: "Create meeting" }).click();

  /* ---- the new record ------------------------------------------------------- */

  await page.waitForURL((url) => /^\/meetings\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"));
  recordUrl = page.url();
  const masthead = page.locator("header").filter({ has: page.getByRole("heading", { level: 1, name: title }) });
  await expect(masthead, "a filed request starts as Requested").toContainText("Requested");

  /* ---- log an activity, and watch the rail derive the wait ------------------ */

  await page.getByRole("link", { name: "Log activity" }).click();
  await page.waitForURL("**/activity**");

  await page.getByLabel("What happened?").fill("Sent the draft agenda and asked for the final delegation roster.");
  await chooseRadio(page, "Visitor");
  await page.getByLabel("Who exactly?").fill(waitingOnWho);
  await page.getByRole("button", { name: "Log activity" }).click();

  const rail = page.getByRole("complementary", { name: "Meeting summary" });
  await expect(rail, "the rail must name who we are waiting on").toContainText(waitingOnWho, { timeout: 30_000 });
  await expect(rail, "and how long we have been waiting").toContainText(/business day/);

  /* ---- move it on ----------------------------------------------------------- */

  await page.getByRole("button", { name: "Change status" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("New status").selectOption({ label: "Developing" });
  await dialog.getByRole("button", { name: "Move to Developing" }).click();

  await expect(dialog).toBeHidden();
  await expect(masthead, "the masthead pill must follow the status").toContainText("Developing", { timeout: 30_000 });

  /* ---- and it is where the list says it should be --------------------------- */

  await page.goto("/meetings?status=developing&sort=updated&dir=desc");
  const row = page.getByRole("link", { name: new RegExp(escapeRegExp(title)) });
  await expect(row, "the new meeting must appear under the Developing filter").toBeVisible({ timeout: 30_000 });
  await expect(row).toHaveAttribute("href", new RegExp(`${escapeRegExp(new URL(recordUrl).pathname)}$`));

  /* ---- file the final agenda, and get the same bytes back ------------------- */

  await page.goto(`${recordUrl}/documents`);
  const slot = page.getByRole("group", { name: "Final Agenda" });
  await expect(slot).toBeVisible();

  const pdf = minimalPdf(`Smoke test agenda ${stamp()}`);
  await slot.getByLabel("Upload Final Agenda").setInputFiles({ name: "smoke-agenda.pdf", mimeType: "application/pdf", buffer: pdf });
  await expect(page.getByText("Final Agenda uploaded."), "the upload must be confirmed in the coordinator's own words").toBeVisible({ timeout: 30_000 });

  // The title derives from the file name; the download link is the proof the file is on record.
  const download = slot.getByRole("link", { name: "Download smoke agenda" });
  await expect(download).toBeVisible();
  const downloadHref = await download.getAttribute("href");
  expect(downloadHref).toMatch(/^\/api\/documents\/[^/]+\/file\?download=1$/);

  const file = await page.request.get(downloadHref!);
  expect(file.status(), "the file must download for the person who filed it").toBe(200);
  expect(file.headers()["content-type"]).toContain("application/pdf");
  expect(file.headers()["content-disposition"]).toMatch(/^attachment;/);
  expect(Buffer.from(await file.body()).equals(pdf), "what comes back must be byte for byte what went in").toBe(true);

  /* ---- readiness derives itself from the file ------------------------------- */

  await page.goto(recordUrl);
  await expect(page.getByText("Final agenda on file"), "the checklist must notice the agenda without anyone ticking a box").toBeVisible();

  /* ---- reports: the figures, the workbook and the brief --------------------- */

  await page.goto("/reports");
  await expect(page.getByRole("list", { name: "Key figures" }).getByRole("listitem"), "the summary opens on four figures").toHaveCount(4);

  const workbook = await page.request.get("/api/reports/export?as=xlsx");
  expect(workbook.status(), "the workbook must download").toBe(200);
  expect(workbook.headers()["content-type"]).toContain("spreadsheetml");
  expect(workbook.headers()["content-disposition"]).toMatch(/^attachment; filename="ivp-reports-FY\d\d-\d{4}-\d\d-\d\d\.xlsx"$/);
  expect((await workbook.body()).subarray(0, 2).toString("latin1"), "a workbook is a zip container").toBe("PK");

  const brief = await page.request.get("/api/reports/brief");
  expect(brief.status(), "the executive brief must render").toBe(200);
  expect(brief.headers()["content-type"]).toContain("application/pdf");
  expect(brief.headers()["content-disposition"]).toMatch(/^attachment; filename="ivp-executive-brief-FY\d\d\.pdf"$/);
  expect((await brief.body()).subarray(0, 5).toString("latin1"), "the brief is a real PDF").toBe("%PDF-");
});

test("an executive reads the whole program and files none of it", async ({ page }) => {
  await signInAs(page, "executive");

  await expect(page.getByRole("region", { name: "Upcoming meetings" }), "an executive still gets the glance view").toBeVisible();
  await expect(page.getByRole("link", { name: "New meeting", exact: true }), "intake is not an executive's control").toHaveCount(0);

  await page.goto("/meetings/new");
  await page.waitForURL("**/forbidden");
  await expect(page.getByRole("heading", { level: 1, name: /Your role can.t open that/ })).toBeVisible();

  /* ---- reports and the library are theirs to read --------------------------- */

  await page.goto("/reports");
  await expect(page.getByRole("list", { name: "Key figures" }).getByRole("listitem"), "an executive gets the same four figures").toHaveCount(4);
  await expect(page.getByRole("link", { name: "Open the brief" }), "and the brief is one click away").toBeVisible();

  await page.goto("/documents");
  const library = page.getByRole("table");
  await expect(library).toBeVisible();
  await library.getByRole("button", { name: /^Actions for / }).first().click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "View meeting" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Remove" }), "an executive cannot remove a document").toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: /^(Star|Unstar)$/ }), "nor mark one reusable").toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();

  /* ---- and the coordinator's record shows them the file, not the drop target - */

  await page.goto(`${recordUrl}/documents`);
  await expect(page.getByRole("group", { name: "Final Agenda" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download smoke agenda" }), "the agenda is there to read").toBeVisible();
  await expect(page.locator('[data-testid="upload-dropzone"]'), "nothing invites an executive to upload").toHaveCount(0);
});

/** The card's two ranges, by the words on their toggles, as the full screen's URL names them. */
const CARD_RANGE_KEYS: Record<string, string> = { "Next 30 days": "next30", "This year": "this" };

/**
 * The full screen keeps its view in the URL, so Back from a record returns to it exactly. The card
 * opens the full screen on its own range; a format, a country and one of its meetings narrow it;
 * the meeting's record is a page of its own, and Back has to bring the whole view back. Nothing
 * here writes, and nothing leans on the tests above: it reads whatever the seeded program holds.
 */
test("a reader goes from the dashboard's map to the full screen, into a record, and Back to the same view", async ({ page }) => {
  await signInAs(page, "coordinator");

  /* ---- the card opens the full screen on its own range ---------------------- */

  const card = page.getByRole("region", { name: "Global reach", exact: true });
  await expect(card, "the dashboard carries the Global reach card").toBeVisible();
  const cardRange = ((await card.getByRole("group", { name: "Range" }).getByRole("button", { pressed: true }).textContent()) ?? "").trim();
  const rangeKey = CARD_RANGE_KEYS[cardRange];
  expect(rangeKey, `the card's range toggle reads "${cardRange}"`).toBeDefined();

  await card.getByRole("link", { name: "Full screen" }).click();
  await page.waitForURL((url) => url.pathname === "/reach");
  expect(new URL(page.url()).searchParams.get("range"), `the full screen must open on the card's range (${cardRange})`).toBe(rangeKey);
  const timeline = page.getByRole("region", { name: "Timeline", exact: true });
  await expect(timeline.getByRole("button", { name: cardRange, exact: true }), "and its timeline must say so").toHaveAttribute("aria-pressed", "true");

  /* ---- narrow it: a format, a country, one of its meetings ------------------ */

  const inPerson = page.getByRole("checkbox", { name: "In person" });
  await inPerson.click();
  await expect(inPerson).toBeChecked();
  await expect(page, "a filter is part of the view, so it is in the URL").toHaveURL(/[?&]format=in_person(&|$)/);

  const details = page.getByRole("complementary", { name: "Details", exact: true });
  await details.getByRole("tab", { name: "Countries", exact: true }).click();
  await details.getByRole("tabpanel").getByRole("button").first().click();
  await expect(page, "so is a chosen country").toHaveURL(/[?&]country=[A-Z]{2}(&|$)/);

  // The country's own meetings in the window are the rows under "In this window".
  const inWindow = details.locator("section").filter({ has: page.getByRole("heading", { name: "In this window" }) });
  await inWindow.getByRole("button").first().click();
  const recordLink = details.getByRole("link", { name: "Open the meeting record" });
  await expect(recordLink, "the Details panel must show the chosen meeting").toBeVisible();
  await expect(page, "and a chosen meeting").toHaveURL(/[?&]meeting=[^&]+/);
  const meetingId = new URL(page.url()).searchParams.get("meeting") ?? "";
  const organization = ((await details.getByRole("heading", { level: 3 }).textContent()) ?? "").trim();
  const left = page.url();

  /* ---- into its record, and Back ------------------------------------------- */

  await recordLink.click();
  await page.waitForURL((url) => url.pathname === `/meetings/${meetingId}`);
  await expect(page.getByRole("complementary", { name: "Meeting summary" }), "the meeting's record must open").toBeVisible();

  await page.goBack();
  await expect(details.getByRole("heading", { level: 3, name: organization }), "Back must show the meeting's view again").toBeVisible();
  await expect(page, "at exactly the URL the reader left").toHaveURL(left);
  await expect(recordLink, "for the same meeting").toHaveAttribute("href", `/meetings/${meetingId}`);
  await expect(inPerson, "with its filter still ticked").toBeChecked();
});
