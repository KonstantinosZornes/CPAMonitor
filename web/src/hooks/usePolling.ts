import { useState, useEffect, useRef, useCallback } from 'react';

interface UsePollingOptions {
  intervalSeconds: number; // 0 means paused
  onPoll: () => Promise<void> | void;
  enabled?: boolean;
}

export function usePolling({ intervalSeconds, onPoll, enabled = true }: UsePollingOptions) {
  const [progress, setProgress] = useState<number>(0);
  const timerRef = useRef<number | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const isPollingRef = useRef<boolean>(false);

  const onPollRef = useRef(onPoll);
  onPollRef.current = onPoll;

  const executePoll = useCallback(async () => {
    // 判重防护：若前一次请求仍在进行中，跳过本次轮询，避免并发堆积
    if (isPollingRef.current) {
      return;
    }
    isPollingRef.current = true;
    setProgress(0);
    startTimeRef.current = Date.now();
    try {
      await onPollRef.current();
    } catch (err) {
      console.error('Polling error', err);
    } finally {
      isPollingRef.current = false;
    }
  }, []);

  const resetTimers = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);

    if (intervalSeconds <= 0 || !enabled) {
      setProgress(0);
      return;
    }

    startTimeRef.current = Date.now();

    // 进度条每 100ms 更新一次
    progressTimerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const total = intervalSeconds * 1000;
      const pct = Math.min(100, (elapsed / total) * 100);
      setProgress(pct);
    }, 100);

    // 定时轮询触发
    timerRef.current = window.setInterval(() => {
      executePoll();
    }, intervalSeconds * 1000);
  }, [intervalSeconds, enabled, executePoll]);

  useEffect(() => {
    resetTimers();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, [resetTimers]);

  const triggerNow = useCallback(() => {
    executePoll();
    resetTimers();
  }, [executePoll, resetTimers]);

  const isPaused = intervalSeconds === 0 || !enabled;

  return {
    progress,
    isPaused,
    triggerNow,
  };
}
