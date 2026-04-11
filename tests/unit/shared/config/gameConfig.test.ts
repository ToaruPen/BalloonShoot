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
      extendedThreshold: 1.15,
      curledThreshold: 0.65,
      curlHysteresisGap: 0.05,
      zAssistWeight: 0
    });
  });
});
