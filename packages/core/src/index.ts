/**
 * SoloEnterprise Core
 *
 * Core orchestration functionality:
 * - Task queue management
 * - File lock management
 * - Orchestrator logic
 *
 * Services are exported separately to avoid naming conflicts:
 *   import { publishTaskEvent } from '@soloenterprise/core/services';
 */

export * from './queue/index';
export * from './locks/index';

// Re-export specific non-conflicting items from services
export {
  registerWorker,
  deregisterWorker,
  sendHeartbeat,
  getWorkerStatus,
  getAllWorkerStatuses,
  requestWorkerStop,
  isStopRequested,
  clearStopRequest,
  updateLastTaskTime,
  closeRegistryConnection,
  type WorkerType,
  type WorkerStatus,
} from './services/worker-registry';

export {
  publishTaskEvent,
  createTaskEventSubscriber,
  getTaskEventsChannel,
  closePublisher,
  type TaskEvent,
} from './services/task-events';

export {
  createTask,
  updateTaskStatus,
  getTask,
  type CreateTaskInput,
} from './services/task-service';

export {
  GENERATED_ROOT,
  GENERATED_TASKS_DIR,
  GENERATED_REPORTS_DIR,
  GENERATED_UPLOADS_DIR,
  getGeneratedTaskDir,
  getGeneratedReportDir,
  getGeneratedUploadsDir,
} from './utils/generated-dir';
