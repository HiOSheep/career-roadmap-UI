import assert from "node:assert/strict";
import { DocumentDecryption } from "../src/document-decryption.ts";

// The suite only exercises the timing decisions, so a root that reports no text
// is enough: the covers are never built, but progress and start conditions are
// exactly the ones the real document uses.
const emptyRoot = () => ({ querySelectorAll: () => [] });
const revealed = { clarity: 1 };
const held = { clarity: 0 };

// --- the first presentation waits for the case and uncovers slowly ----------
const first = new DocumentDecryption();
assert.equal(first.enter(emptyRoot(), true, true), "full", "The first entry is the full pass");
assert.notEqual(first.progress, 1, "The first entry starts redacted");
first.update(0, held, false);
assert.notEqual(first.progress, 1, "A held frame keeps the text covered");
first.update(1, held, false);
assert.notEqual(first.progress, 1, "The full pass really does wait for the case");
first.update(2, revealed, false);
assert.ok(first.progress < 1, "The case clearing starts the uncovering");
const early = first.progress;
first.update(2.3, revealed, false);
assert.ok(first.progress > early, "The uncovering advances");
const firstSpeed = first.progress;
const quickComparison = new DocumentDecryption();
quickComparison.enter(emptyRoot(), true, true);
quickComparison.enter(emptyRoot(), true, true);
quickComparison.update(0, held, false);
quickComparison.update(.2, held, false);
quickComparison.update(.5, held, false);
assert.ok(firstSpeed < quickComparison.progress, "At equal reveal age, first-entry redaction advances more slowly than later entries");
first.update(4, revealed, false);
assert.equal(first.progress, 1, "The full pass completes on its own");

// --- later presentations keep the redaction but skip the middle -------------
const later = new DocumentDecryption();
assert.equal(later.enter(emptyRoot(), true, true), "full");
later.update(0, revealed, false);
later.update(4, revealed, false);
assert.equal(later.progress, 1);
assert.equal(later.enter(emptyRoot(), true, true), "quick", "The second entry is the quick pass");
assert.notEqual(later.progress, 1, "The redaction is still shown on later entries");
later.update(10, held, false);
assert.equal(later.progress, 0, "The quick pass holds briefly");
later.update(10.1, held, false);
assert.equal(later.progress, 0, "The hold is short but real");
later.update(10.2, held, false);
assert.equal(later.progress, 0, "The uncovering is armed once the hold elapses");
later.update(10.45, held, false);
assert.ok(later.progress > 0, "The text uncovers without waiting for the scene");
later.update(10.6, held, false);
assert.ok(later.progress > 0 && later.progress < 1, "The quick uncovering is still an animation");
later.update(11, held, false);
assert.equal(later.progress, 1, "The quick pass completes");
assert.equal(later.enter(emptyRoot(), true, true), "quick", "Every later entry stays quick");

// The quick pass must not be slower than the full one, and must not wait.
const quickDuration = 0.5, fullDuration = 0.95;
assert.ok(quickDuration < fullDuration, "The quick uncovering is shorter than the full one");

// --- an invisible panel must not spend the reveal ---------------------------
// The panel fades in with the case lid; if the covers ran their clock while it
// was still transparent, the whole transition would play unseen.
const hidden = new DocumentDecryption();
assert.equal(hidden.enter(emptyRoot(), true, true), "full");
hidden.update(0, revealed, false, 0);
hidden.update(3, revealed, false, 0);
assert.equal(hidden.started, null, "The full pass waits for the document to be visible");
assert.notEqual(hidden.progress, 1, "The covers are still up while it is hidden");
hidden.update(3.1, revealed, false, 1);
assert.notEqual(hidden.started, null, "It starts as soon as the document appears");
hidden.update(3.4, revealed, false, 1);
assert.ok(hidden.progress > 0 && hidden.progress < 1, "Then the text uncovers");

const late = new DocumentDecryption();
assert.equal(late.enter(emptyRoot(), true, true), "full");
late.update(0, revealed, false);
late.update(5, revealed, false);
assert.equal(late.progress, 1);
assert.equal(late.enter(emptyRoot(), true, true), "quick");
late.update(10, held, false, 0);
assert.equal(late.progress, 0, "A hidden panel keeps the redaction");
late.update(12, held, false, 0);
assert.equal(late.progress, 0, "Even once the hold window would have elapsed");
late.update(13, held, false, 1);
assert.equal(late.progress, 0, "The hold starts when the panel appears, not before");
late.update(13.7, held, false, 1);
assert.equal(late.progress, 0, "The uncovering is armed at the end of the hold");
late.update(14, held, false, 1);
assert.ok(late.progress > 0, "Then the quick pass uncovers it");
late.update(14.5, held, false, 1);
assert.equal(late.progress, 1, "And finishes");

// The visibility gate must not become a trap: a reduced-motion or sceneless
// entry still reveals at once, whatever the panel reports.
const forced = new DocumentDecryption();
assert.equal(forced.enter(emptyRoot(), true, true), "full");
forced.update(0, revealed, false, 0);
assert.notEqual(forced.progress, 1, "Still covered while hidden");
const expandedLate = new DocumentDecryption();
assert.equal(expandedLate.enter(emptyRoot(), false, true), "expanded");
expandedLate.update(0, held, false, 0);
assert.equal(expandedLate.progress, 1, "A suppressed reveal does not wait for anything");

// --- reduced motion and a disabled scene show the text at once --------------
const reduced = new DocumentDecryption();
assert.equal(reduced.enter(emptyRoot(), false, true), "expanded", "Reduced motion shows the text at once");
assert.equal(reduced.progress, 1);
assert.equal(reduced.enter(emptyRoot(), true, true), "full", "The full pass is still unspent");

const noScene = new DocumentDecryption();
assert.equal(noScene.enter(emptyRoot(), true, false), "expanded", "Without the 3D scene the text stays readable");
assert.equal(noScene.progress, 1);
assert.equal(noScene.enter(emptyRoot(), true, true), "full", "The full pass is still unspent");

// --- an expanded entry never starts uncovering ------------------------------
const expanded = new DocumentDecryption();
assert.equal(expanded.enter(emptyRoot(), false, false), "expanded");
expanded.update(0, revealed, false);
assert.equal(expanded.progress, 1, "An expanded entry never starts retracting");

console.log(
  "Document reveal checks passed: full pass waits for the case, later passes hold briefly then uncover without waiting, reduced motion and a missing scene leave the full pass unspent.",
);
