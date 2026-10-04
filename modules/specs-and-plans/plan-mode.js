// Plan mode, in two acts. Act 1: weekend deposits, with members exempt, planned and built in plan mode.
// Act 2, five months later: a free month's membership for every new customer, planned and built the same way.
// The plan never mentions that new customers' first weekend bookings now skip the deposit.
// Based on real Claude Code runs; see SOURCES.md.

import { start } from "./conversation.js";
import { code } from "./restaurant.js";

/** @typedef {import("./conversation.js").Script} Script */

/** Repo snapshots: v0 at the start, v1 after the weekend deposits, v2 after the free month. */
const files = code;

const DEPOSITS = "Charge a deposit of £10 per head on every Friday and Saturday booking. Members don't have to pay it.";
const FREE_MONTH = "Give every new customer a free month's membership when they make their first booking.";

/** @type {Script} */
const script = {
  acts: ["Plan mode", "Five months later"],
  tree: ["bookings.py", "guests.py", "payments.py", "tests/", "  test_bookings.py", "README.md"],
  files,
  turns: [
    {
      act: 0,
      title: "The request",
      before: [{ reset: "v0" }, { mode: "plan" }],
      callout: { html: "This is a booking system for a restaurant. Guests book tables, and some of them are members who have special benefits.", place: "center" },
      options: [{
        label: "Send",
        send: DEPOSITS,
        ops: [
          { tool: "Read(bookings.py)", file: "bookings.py", show: true },
          { tool: "Read(guests.py)", file: "guests.py" },
          { tool: "Read(payments.py)", file: "payments.py" },
          { box: `<span class="h">Plan: weekend deposits</span>
1. Add requires_deposit(guest, booking) in
   bookings.py. Friday and Saturday bookings pay
   £10 per head, except for members on the
   booking date.
2. Charge it in book() through payments.charge.
3. Tests: Friday pays, midweek doesn't, a member
   doesn't.

Ready to build?` },
        ],
      }],
    },
    {
      act: 0,
      title: "Approve",
      options: [{
        label: "1. Yes, start building",
        ops: [
          { mode: "normal" },
          { tool: "Update(bookings.py)", file: "bookings.py", to: "v1", show: true },
          { diff: `<span class="add">+def requires_deposit(guest, booking):</span>
<span class="add">+    if booking.start.weekday() not in (FRIDAY, SATURDAY):</span>
<span class="add">+        return False</span>
<span class="add">+    # Members are exempt</span>
<span class="add">+    if guest.is_member(booking.start.date()):</span>
<span class="add">+        return False</span>
<span class="add">+    return True</span>` },
          { tool: "Update(tests/test_bookings.py)", file: "tests/test_bookings.py", to: "v1" },
          { tool: "Bash(python -m pytest)" },
          { line: "5 passed", cls: "ok" },
          { line: "Done. Weekend bookings take a £10-per-head deposit, and members are exempt.", cls: "say" },
        ],
      }],
    },
    {
      act: 1,
      title: "The request",
      scene: true,
      before: [{ reset: "v1" }, { mode: "plan" }],
      callout: { html: "Five months later, a new requirement has come in.", place: "center" },
      options: [{
        label: "Send",
        send: FREE_MONTH,
        ops: [
          { tool: "Read(bookings.py)", file: "bookings.py", show: true, focus: ["def requires_deposit", "def book"] },
          { tool: "Read(guests.py)", file: "guests.py" },
          { tool: "Read(tests/test_bookings.py)", file: "tests/test_bookings.py" },
          { box: `<span class="h">Plan: a free month for new customers</span>
1. guests.py: add grant_free_month(start), which
   sets member_until one calendar month after
   start.
2. bookings.py: in book(), call it on a guest's
   first booking (visits == 0), so the first
   booking is covered.
3. Tests: the grant and its end date, a second
   booking, month-end clamping. Update the Friday
   deposit test to use a returning guest.

Do you want me to go ahead?` },
        ],
      }],
    },
    {
      act: 1,
      title: "Approve",
      callout: { html: "Can you spot the problem here?", place: "top" },
      options: [{
        label: "1. Yes, start building",
        ops: [
          { mode: "normal" },
          { tool: "Update(guests.py)", file: "guests.py", to: "v2" },
          { tool: "Update(bookings.py)", file: "bookings.py", to: "v2", show: true },
          { diff: `     def book(guest, start, party_size):
<span class="add">+    if guest.visits == 0:</span>
<span class="add">+        guest.grant_free_month(start.date())</span>
         guest.visits += 1` },
          { tool: "Update(tests/test_bookings.py)", file: "tests/test_bookings.py", to: "v2" },
          { tool: "Bash(python -m pytest)" },
          { line: "9 passed", cls: "ok" },
          { line: "Done. New customers get a free month of membership on their first booking.", cls: "say" },
        ],
        callout: { html: "New customers now become members when they first book. Members don't pay the deposit, so a new customer pays no deposit.", place: "top" },
      }],
    },
  ],
};

start(script);
