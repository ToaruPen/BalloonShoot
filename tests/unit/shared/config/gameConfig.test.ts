import { describe, expect, it } from "vitest";
import { gameConfig } from "../../../../src/shared/config/gameConfig";

describe("gameConfig", () => {
  it("exposes the PoC camera and input defaults", () => {
    expect(gameConfig.camera).toEqual({
      width: 640,
      height: 480
    });
    expect(gameConfig.input).toEqual({
      smoothingAlpha: 0.28,
      triggerPullThreshold: 0.3,
      triggerReleaseThreshold: 0.1,
      handFilterMinCutoff: 1.0,
      handFilterBeta: 0,
      handFilterDCutoff: 1.0
    });
  });
});
