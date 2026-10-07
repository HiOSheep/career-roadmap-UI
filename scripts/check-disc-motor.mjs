import assert from "node:assert/strict";
import { DiscMotor, DISC_SPIN_RATE } from "../src/cd-case.ts";

const motor = new DiscMotor();
motor.step(true, 1 / 60);
assert.ok(motor.speed > 0 && motor.speed < DISC_SPIN_RATE, "Playback accelerates from rest");
motor.step(true, 2);
const beforePause = { angle: motor.angle, speed: motor.speed };
motor.step(false, 1 / 60);
assert.ok(motor.speed > 0 && motor.speed < beforePause.speed, "Pause coasts instead of stopping abruptly");
assert.notEqual(motor.angle, beforePause.angle, "The disc keeps moving during coast-down");
const beforeResume = motor.speed;
motor.step(true, 1 / 60);
assert.ok(motor.speed > beforeResume && motor.speed < DISC_SPIN_RATE, "Rapid resume preserves momentum");
motor.step(false, 4);
assert.equal(motor.speed, 0, "The disc eventually settles");
const stopped = motor.angle;
assert.equal(motor.step(false, 1), stopped, "The stopped angle stays fixed");

const results = [30, 60, 120].map(fps => {
  const disc = new DiscMotor();
  for (const [playing, seconds] of [[true, 1], [false, .5], [true, .4], [false, 1]])
    for (let frame = 0; frame < Math.round(seconds * fps); frame++) disc.step(playing, 1 / fps);
  return disc;
});
for (const result of results.slice(1)) {
  assert.ok(Math.abs(result.angle - results[0].angle) < 1e-10, "Travel is independent of frame rate");
  assert.ok(Math.abs(result.speed - results[0].speed) < 1e-10, "Acceleration is independent of frame rate");
}
const reduced = new DiscMotor();
reduced.step(true, 1 / 60, true);
assert.equal(reduced.speed, DISC_SPIN_RATE);
reduced.step(false, 1 / 60, true);
assert.equal(reduced.speed, 0, "Reduced motion skips the momentum transition");
console.log("Disc motor checks passed: smooth start, coast-down, rapid reversals, settled stop, 30/60/120 fps, reduced motion.");
