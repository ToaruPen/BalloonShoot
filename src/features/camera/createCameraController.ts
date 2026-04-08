import { gameConfig } from "../../shared/config/gameConfig";

export interface CameraController {
  requestStream(): Promise<MediaStream>;
  stop(): void;
}

export const createCameraController = (): CameraController => {
  let stream: MediaStream | undefined;
  let streamRequest: Promise<MediaStream> | undefined;

  return {
    async requestStream(): Promise<MediaStream> {
      if (stream) {
        return stream;
      }

      if (streamRequest) {
        return streamRequest;
      }

      const mediaDevices = (
        globalThis as {
          navigator?: {
            mediaDevices?: MediaDevices;
          };
        }
      ).navigator?.mediaDevices;

      if (typeof mediaDevices?.getUserMedia !== "function") {
        throw new Error("Camera API is unavailable");
      }

      streamRequest = mediaDevices
        .getUserMedia({
          video: {
            width: gameConfig.camera.width,
            height: gameConfig.camera.height,
            facingMode: "user"
          },
          audio: false
        })
        .then((nextStream) => {
          stream = nextStream;
          return nextStream;
        })
        .finally(() => {
          streamRequest = undefined;
        });

      return streamRequest;
    },
    stop(): void {
      if (!stream) {
        return;
      }

      stream.getTracks().forEach((track) => {
        track.stop();
      });
      stream = undefined;
    }
  };
};
