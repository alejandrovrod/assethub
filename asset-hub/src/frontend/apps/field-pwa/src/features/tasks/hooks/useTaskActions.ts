// useTaskActions.ts — Hook for task state transitions
import { useCallback } from 'react';
import { db } from '@asset-hub/core-offline';
import { startTask } from '../../../commands/start-task';
import { pauseTask } from '../../../commands/pause-task';
import { completeTask } from '../../../commands/complete-task';
import { getCurrentPosition } from '../../../shared/lib/geo';

export function useTaskActions() {
  const start = useCallback(async (taskId: string, withGeo = true) => {
    const geo = withGeo ? await getCurrentPosition() : null;
    return startTask(db, taskId, geo);
  }, []);

  const pause = useCallback(async (taskId: string, reason?: string) => {
    return pauseTask(db, taskId, reason);
  }, []);

  const complete = useCallback(async (taskId: string, withGeo = true) => {
    const geo = withGeo ? await getCurrentPosition() : null;
    return completeTask(db, taskId, geo);
  }, []);

  return { start, pause, complete };
}
