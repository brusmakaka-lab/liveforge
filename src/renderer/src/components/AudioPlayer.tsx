import { useEffect } from 'react';

function playbackError(audio: HTMLAudioElement, failure?: unknown): string {
  return JSON.stringify({
    stage: 'HTMLAudio.play',
    code: audio.error?.code,
    message: audio.error?.message,
    rejection:
      failure instanceof Error
        ? `${failure.name}: ${failure.message}`
        : failure === undefined
          ? undefined
          : String(failure),
    readyState: audio.readyState,
    networkState: audio.networkState,
    currentTime: audio.currentTime,
    volume: audio.volume,
    muted: audio.muted,
    output: audio.sinkId || 'default',
    mime: audio.src.slice(0, audio.src.indexOf(';')),
  }).slice(0, 1000);
}

/** Single renderer owns audio; the capture overlay never plays a duplicate. */
export function AudioPlayer() {
  useEffect(() => {
    let current: HTMLAudioElement | undefined;
    const stop = () => {
      if (current) {
        current.pause();
        current.onended = null;
        current.onerror = null;
        current.src = '';
        current = undefined;
      }
    };
    const unsubscribe = window.liveforge.onMedia((message) => {
      if (message.type === 'stopAudio' || message.type === 'stopMedia') {
        stop();
        return;
      }
      if (message.type !== 'audio') return;
      stop();
      const audio = new Audio(message.dataUrl);
      current = audio;
      audio.volume = message.volume;
      const report = (phase: 'started' | 'ended', error?: string) => {
        void window.liveforge.request({ op: 'audioResult', id: message.id, phase, error });
      };
      audio.onended = () => {
        if (current === audio) {
          current = undefined;
          report('ended');
        }
      };
      audio.onerror = () => {
        if (current === audio) {
          current = undefined;
          report('ended', playbackError(audio));
        }
      };
      void audio
        .play()
        .then(() => {
          if (current === audio) report('started');
        })
        .catch((error: unknown) => {
          if (current === audio) {
            current = undefined;
            report('ended', playbackError(audio, error));
          }
        });
    });
    return () => {
      unsubscribe();
      stop();
    };
  }, []);
  return null;
}
