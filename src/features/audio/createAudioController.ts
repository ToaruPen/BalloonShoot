export interface AudioController {
  startBgm(): Promise<void>;
  stopBgm(): void;
  playShot(): void;
  playHit(): void;
  playTimeout(): void;
  playResult(): void;
}

const playOneShot = (src: string): void => {
  const audio = new Audio(src);
  void audio.play();
};

export const createAudioController = (): AudioController => {
  const bgm = new Audio("/audio/bgm.mp3");
  bgm.loop = true;

  return {
    async startBgm(): Promise<void> {
      await bgm.play();
    },
    stopBgm(): void {
      bgm.pause();
      bgm.currentTime = 0;
    },
    playShot(): void {
      playOneShot("/audio/shot.mp3");
    },
    playHit(): void {
      playOneShot("/audio/hit.mp3");
    },
    playTimeout(): void {
      playOneShot("/audio/time-up.mp3");
    },
    playResult(): void {
      playOneShot("/audio/result.mp3");
    }
  };
};
