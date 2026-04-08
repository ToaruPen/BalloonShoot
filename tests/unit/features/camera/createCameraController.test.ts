import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCameraController } from "../../../../src/features/camera/createCameraController";

describe("createCameraController", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: undefined
    });
  });

  it("requests a single user-facing 640x480 stream and reuses it until stopped", async () => {
    const stop = vi.fn();
    const stream = {
      getTracks: () => [{ stop }]
    } as unknown as MediaStream;
    const getUserMedia = vi.fn(() => Promise.resolve(stream));

    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        mediaDevices: {
          getUserMedia
        }
      }
    });

    const controller = createCameraController();
    const firstRequest = controller.requestStream();
    const secondRequest = controller.requestStream();

    await expect(firstRequest).resolves.toBe(stream);
    await expect(secondRequest).resolves.toBe(stream);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({
      video: {
        width: 640,
        height: 480,
        facingMode: "user"
      },
      audio: false
    });

    controller.stop();

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("fails fast when mediaDevices.getUserMedia is unavailable", async () => {
    const controller = createCameraController();

    await expect(controller.requestStream()).rejects.toThrow("Camera API is unavailable");
  });
});
