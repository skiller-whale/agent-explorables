// OpenSpec, in two acts, on the same restaurant and the same two requests as the plan-mode explainer.
// Act 1: weekend deposits with members exempt, taken through explore, propose, apply and archive,
// with a tour of the files each stage writes. Act 2, five months later: the free month. Claude reads
// the deposit spec while exploring, asks whether the first booking still pays, and the change goes through.
// Based on real Claude Code runs; see SOURCES.md.

import { start } from "./conversation.js";
import { code, openspecV2 } from "./restaurant.js";

/** @typedef {import("./conversation.js").Script} Script */

const C1 = "openspec/changes/add-weekend-deposit/";
const C2 = "openspec/changes/add-welcome-membership/";
const A1 = "openspec/changes/archive/2026-05-12-add-weekend-deposit/";
const A2 = "openspec/changes/archive/2026-10-13-add-welcome-membership/";
const DEPOSIT_SPEC = "openspec/specs/booking-deposit/spec.md";
const MEMBERSHIP_SPEC = "openspec/specs/welcome-membership/spec.md";

// ---- Act 1: the change, as propose writes it ----
const proposal1 = `## Why

Weekend tables are the ones people book and then don't turn up to.

## What Changes

- Friday and Saturday bookings pay a deposit of £10 per head when they're made.
- Members pay no deposit, and that covers their whole party.

## Capabilities

### New Capabilities
- \`booking-deposit\`: when a deposit is due, how much it is, and who is exempt.`;

const requirements1 = `### Requirement: Weekend bookings pay a deposit
The system SHALL charge a deposit of £10 per head when a booking is made for a Friday or Saturday.

#### Scenario: Friday booking
- **WHEN** a guest who is not a member books a table for 3 on a Friday
- **THEN** a deposit of £30 is charged

#### Scenario: Midweek booking
- **WHEN** a guest books a table on a Wednesday
- **THEN** no deposit is charged

### Requirement: Members are exempt from the deposit
The system SHALL NOT charge a deposit when the guest is a member on the date of the booking. The exemption covers the whole party.

#### Scenario: Member books a weekend table
- **WHEN** a member books a table for 4 on a Saturday
- **THEN** no deposit is charged`;

const delta1 = `## ADDED Requirements

${requirements1}`;

const design1 = `## Context

\`book()\` in \`bookings.py\` counts a visit and returns a \`Booking\`. \`payments.charge()\` exists, but nothing calls it yet.

## Decisions

- Add \`requires_deposit(guest, booking)\` to \`bookings.py\`, so the rule is in one place and easy to test.
- Check membership on the date of the booking, not the day it's made.
- Record the amount on the booking as \`deposit\`.

## Non-Goals

- Refunds and cancellations.`;

/** @param {boolean[]} done */
const tasks1 = (done) => {
  const box = (/** @type {number} */ i) => (done[i] ? "[x]" : "[ ]");
  return `## 1. Deposit rule

- ${box(0)} 1.1 Add \`requires_deposit()\` to \`bookings.py\`
- ${box(1)} 1.2 Charge the deposit in \`book()\` and record it on the booking

## 2. Tests

- ${box(2)} 2.1 Test a Friday booking, a midweek booking and a member's booking`;
};

const spec1 = `# booking-deposit Specification

## Purpose
Take a deposit on weekend bookings, when they're made.

## Requirements

${requirements1}`;

// ---- Act 2 ----
const proposal2 = `## Why

New customers have no reason to join the supper club until they've eaten with us. A free month gives them the member benefits on their next visits.

## What Changes

- A guest's first booking gives them a free month's membership.
- The first booking still pays any deposit it owes. The membership starts after it.

## Capabilities

### New Capabilities
- \`welcome-membership\`: the free month a guest gets with their first booking.

### Modified Capabilities
None. The \`booking-deposit\` requirements are unchanged.`;

const requirements2 = `### Requirement: A first booking grants a free month
The system SHALL make a guest a member for one month when they make their first booking.

#### Scenario: First booking
- **WHEN** a new guest books a table for Wednesday 13 May
- **THEN** they are a member until 13 June

### Requirement: The first booking pays its deposit
The system SHALL work out the first booking's deposit before it grants the membership.

#### Scenario: First booking on a Friday
- **WHEN** a new guest books a table for 2 on a Friday
- **THEN** a deposit of £20 is charged
- **AND** they are a member for the next month`;

const delta2 = `## ADDED Requirements

${requirements2}`;

const design2 = `## Decisions

- Add \`grant_free_month(start)\` to \`Guest\`. It never shortens a longer membership.
- In \`book()\`, grant the month after the deposit is charged, so the first booking pays as a non-member.
- A month ends on the same date next month, or on the last day of a shorter month.`;

/** @param {boolean[]} done */
const tasks2 = (done) => {
  const box = (/** @type {number} */ i) => (done[i] ? "[x]" : "[ ]");
  return `## 1. Membership

- ${box(0)} 1.1 Add \`grant_free_month()\` to \`guests.py\`
- ${box(1)} 1.2 Grant it in \`book()\`, after the deposit

## 2. Tests

- ${box(2)} 2.1 Test the grant, its end date, and a first booking on a Friday`;
};

const spec2 = `# welcome-membership Specification

## Purpose
Give new customers a free month of membership with their first booking.

## Requirements

${requirements2}`;

// ---- snapshots ----
const empty = { "openspec/specs/": "", "openspec/changes/": "" };
/** @param {string} dir */
const change1 = (dir) => ({ [`${dir}proposal.md`]: proposal1, [`${dir}design.md`]: design1, [`${dir}tasks.md`]: tasks1([true, true, true]), [`${dir}specs/booking-deposit/spec.md`]: delta1 });
/** @param {string} dir */
const change2 = (dir) => ({ [`${dir}proposal.md`]: proposal2, [`${dir}design.md`]: design2, [`${dir}tasks.md`]: tasks2([true, true, true]), [`${dir}specs/welcome-membership/spec.md`]: delta2 });

const files = {
  v0: { ...code.v0, ...empty },
  // what propose writes in Act 1, and the tasks as apply ticks them
  p1: { [`${C1}proposal.md`]: proposal1, [`${C1}specs/booking-deposit/spec.md`]: delta1, [`${C1}design.md`]: design1, [`${C1}tasks.md`]: tasks1([false, false, false]) },
  t1a: { [`${C1}tasks.md`]: tasks1([true, false, false]) },
  t1b: { [`${C1}tasks.md`]: tasks1([true, true, false]) },
  t1c: { [`${C1}tasks.md`]: tasks1([true, true, true]) },
  v1: code.v1,
  // after archiving Act 1
  a1: { ...code.v1, [DEPOSIT_SPEC]: spec1, ...change1(A1) },
  p2: { [`${C2}proposal.md`]: proposal2, [`${C2}specs/welcome-membership/spec.md`]: delta2, [`${C2}design.md`]: design2, [`${C2}tasks.md`]: tasks2([false, false, false]) },
  t2a: { [`${C2}tasks.md`]: tasks2([true, false, false]) },
  t2b: { [`${C2}tasks.md`]: tasks2([true, true, false]) },
  t2c: { [`${C2}tasks.md`]: tasks2([true, true, true]) },
  v2: openspecV2,
  a2: { ...openspecV2, [DEPOSIT_SPEC]: spec1, [MEMBERSHIP_SPEC]: spec2, ...change1(A1), ...change2(A2) },
};

const DEPOSITS = "Charge a deposit of £10 per head on every Friday and Saturday booking. Members don't have to pay it.";
const FREE_MONTH = "Give every new customer a free month's membership when they make their first booking.";

/**
 * A stop on a tour of the files: the viewer opens the file, a callout beside it says what it is for,
 * and the coach moves on with a step button, or with the next real message.
 * @param {number} act
 * @param {string} title
 * @param {string} file
 * @param {string} html
 * @param {import("./conversation.js").Option} [option]
 * @param {string | string[]} [focus]
 * @returns {import("./conversation.js").Turn}
 */
const stop = (act, title, file, html, option, focus) => ({
  act,
  title,
  before: [{ view: file, focus }],
  callout: { html, place: "side" },
  options: [option ?? { label: "Next", quiet: true, ops: [] }],
});

/** @type {Script} */
const script = {
  acts: ["OpenSpec", "Five months later"],
  stages: ["Explore", "Propose", "Apply", "Archive"],
  collapse: ["openspec/changes/archive/"],
  files,
  turns: [
    {
      act: 0,
      title: "Explore",
      before: [{ reset: "v0" }],
      callout: { html: "The same restaurant and the same request as before, this time with OpenSpec.", place: "center" },
      options: [{
        label: "Send",
        send: `/opsx:explore ${DEPOSITS}`,
        ops: [
          { stage: 0 },
          { tool: "Read(bookings.py)", file: "bookings.py", show: true },
          { tool: "Read(guests.py)", file: "guests.py" },
          { tool: "Read(payments.py)", file: "payments.py" },
          { box: `One question blocks the rest. When a member books
for four, who is exempt?

  A. The whole party.
  B. Only the member. The other three pay £30.

I'd go with A, because a booking only records one guest.` },
        ],
      }],
    },
    {
      act: 0,
      title: "Answer",
      options: [{
        label: "Send",
        send: "A.",
        ops: [{ line: "Whole party, then. Run /opsx:propose when you're ready and I'll write it up as a change.", cls: "say" }],
      }],
    },
    {
      act: 0,
      title: "Propose",
      options: [{
        label: "Send",
        send: "/opsx:propose",
        ops: [
          { stage: 1 },
          { tool: "Bash(openspec new change add-weekend-deposit)" },
          { tool: `Write(${C1}proposal.md)`, file: `${C1}proposal.md`, to: "p1" },
          { tool: `Write(${C1}specs/booking-deposit/spec.md)`, file: `${C1}specs/booking-deposit/spec.md`, to: "p1" },
          { tool: `Write(${C1}design.md)`, file: `${C1}design.md`, to: "p1" },
          { tool: `Write(${C1}tasks.md)`, file: `${C1}tasks.md`, to: "p1" },
          { line: "I've created the change add-weekend-deposit, with four files. Review them, then run /opsx:apply.", cls: "say" },
        ],
      }],
    },
    stop(0, "proposal.md", `${C1}proposal.md`, "The <b>proposal</b> says why the change is being made and what it will change.", undefined, "*"),
    stop(0, "spec.md", `${C1}specs/booking-deposit/spec.md`, "The <b>spec</b> says what the system should do once the change is made. Each requirement has scenarios that show it working.", undefined, "*"),
    stop(0, "design.md", `${C1}design.md`, "The <b>design</b> says how the code will do it.", undefined, "*"),
    stop(0, "tasks.md", `${C1}tasks.md`, "The <b>tasks</b> are the checklist the agent works through when it builds the change.", {
      label: "Send",
      send: "/opsx:apply",
      ops: [
        { stage: 2 },
        { tool: "Update(bookings.py)", file: "bookings.py", to: "v1", show: true },
        { tool: `Update(${C1}tasks.md)`, file: `${C1}tasks.md`, to: "t1a" },
        { tool: `Update(${C1}tasks.md)`, file: `${C1}tasks.md`, to: "t1b" },
        { tool: "Update(tests/test_bookings.py)", file: "tests/test_bookings.py", to: "v1" },
        { tool: "Bash(python -m pytest)" },
        { line: "5 passed", cls: "ok" },
        { tool: `Update(${C1}tasks.md)`, file: `${C1}tasks.md`, to: "t1c" },
        { line: "All tasks done. 5 tests pass.", cls: "say" },
      ],
    }, "*"),
    stop(0, "Tasks done", `${C1}tasks.md`, "The agent ticks off each task as it finishes it.", undefined, ["- [x] 1.1", "- [x] 1.2", "- [x] 2.1"]),
    stop(0, "bookings.py", "bookings.py", "The code and tests now do what the spec says.", {
      label: "Send",
      send: "/opsx:archive",
      ops: [
        { stage: 3 },
        { tool: "Bash(openspec status --change add-weekend-deposit)" },
        { line: `All tasks are done. Syncing would create ${DEPOSIT_SPEC}. Sync now?`, cls: "say" },
      ],
    }, "def requires_deposit"),
    {
      act: 0,
      title: "Sync",
      callout: { html: "Syncing copies the change's requirements into the project's main specs. They describe how the whole system behaves now, and they're where the agent looks before the next change. The rest of the change goes into the archive.", place: "side" },
      options: [{
        label: "Send",
        send: "Yes.",
        ops: [
          { tool: `Write(${DEPOSIT_SPEC})` },
          { tool: `Bash(mv ${C1} ${A1})` },
          { repo: "a1" },
          { view: DEPOSIT_SPEC, focus: "## Requirements" },
          { line: "Synced and archived.", cls: "say" },
          { stage: 4 },
        ],
      }],
    },
    {
      act: 1,
      title: "Explore",
      scene: true,
      before: [{ reset: "a1" }],
      callout: { html: "Five months later, a new requirement has come in.", place: "center" },
      options: [{
        label: "Send",
        send: `/opsx:explore ${FREE_MONTH}`,
        ops: [
          { stage: 0 },
          { tool: "Read(bookings.py)", file: "bookings.py" },
          { tool: "Read(guests.py)", file: "guests.py" },
          { tool: `Read(${DEPOSIT_SPEC})`, file: DEPOSIT_SPEC, show: true, focus: "The system SHALL NOT charge a deposit" },
        ],
      }],
    },
    stop(1, "The spec", DEPOSIT_SPEC, "The agent reads the main spec to find out how deposits work now.", {
      label: "Next",
      quiet: true,
      ops: [{ box: `One decision blocks the rest. Does the free membership
cover the first booking itself?

  A. Yes. A new guest's first weekend booking pays no deposit.
  B. No. They pay the deposit, and the membership covers
     their next visits.

I recommend B, because then the existing deposit spec
stays correct as written.` }],
    }, "The system SHALL NOT charge a deposit"),
    {
      act: 1,
      title: "Answer",
      options: [{
        label: "Send",
        send: "B.",
        ops: [{ line: "The first booking pays its deposit, then. Run /opsx:propose when you're ready.", cls: "say" }],
      }],
    },
    {
      act: 1,
      title: "Propose",
      options: [{
        label: "Send",
        send: "/opsx:propose",
        ops: [
          { stage: 1 },
          { tool: "Bash(openspec new change add-welcome-membership)" },
          { tool: `Write(${C2}proposal.md)`, file: `${C2}proposal.md`, to: "p2" },
          { tool: `Write(${C2}specs/welcome-membership/spec.md)`, file: `${C2}specs/welcome-membership/spec.md`, to: "p2", show: true, focus: "### Requirement: The first booking pays" },
          { tool: `Write(${C2}design.md)`, file: `${C2}design.md`, to: "p2" },
          { tool: `Write(${C2}tasks.md)`, file: `${C2}tasks.md`, to: "p2" },
          { line: "I've created the change add-welcome-membership. The deposit spec is unchanged.", cls: "say" },
        ],
      }],
    },
    {
      act: 1,
      title: "Apply",
      options: [{
        label: "Send",
        send: "/opsx:apply",
        ops: [
          { stage: 2 },
          { tool: "Update(guests.py)", file: "guests.py", to: "v2" },
          { tool: `Update(${C2}tasks.md)`, file: `${C2}tasks.md`, to: "t2a" },
          { tool: "Update(bookings.py)", file: "bookings.py", to: "v2", show: true },
          { tool: `Update(${C2}tasks.md)`, file: `${C2}tasks.md`, to: "t2b" },
          { tool: "Update(tests/test_bookings.py)", file: "tests/test_bookings.py", to: "v2" },
          { tool: "Bash(python -m pytest)" },
          { line: "10 passed", cls: "ok" },
          { tool: `Update(${C2}tasks.md)`, file: `${C2}tasks.md`, to: "t2c" },
          { line: "All tasks done. 10 tests pass.", cls: "say" },
        ],
      }],
    },
    {
      act: 1,
      title: "Archive",
      options: [{
        label: "Send",
        send: "/opsx:archive",
        ops: [
          { stage: 3 },
          { tool: "Bash(openspec status --change add-welcome-membership)" },
          { line: `All tasks are done. Syncing would create ${MEMBERSHIP_SPEC}. Sync now?`, cls: "say" },
        ],
      }],
    },
    {
      act: 1,
      title: "Sync",
      options: [{
        label: "Send",
        send: "Yes.",
        ops: [
          { tool: `Write(${MEMBERSHIP_SPEC})` },
          { tool: `Bash(mv ${C2} ${A2})` },
          { repo: "a2" },
          { view: MEMBERSHIP_SPEC },
          { line: "Synced and archived.", cls: "say" },
          { stage: 4 },
        ],
      }],
    },
  ],
};

start(script);
