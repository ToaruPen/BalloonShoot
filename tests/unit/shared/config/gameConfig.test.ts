import { describe, expect, it } from "vitest";
import { gameConfig } from "../../../../src/shared/config/gameConfig";

describe("gameConfig", () => {
  it("exposes the agreed camera and input defaults", () => {
    expect(gameConfig).toEqual({
      camera: {
        width: 640,
        height: 480
      },
      input: {
        smoothingAlpha: 0.28,
        triggerPullThreshold: 0.45,
        triggerReleaseThreshold: 0.25
      }
    });
  });
});
