/**
 * SoloEnterprise Database Schema
 * 
 * Core tables for the AI agent orchestration system:
 * - projects: Top-level container for a product build
 * - tasks: Work items with state machine
 * - questions: Human input queue
 * - file_locks: Prevents agent conflicts
 * - artifacts: Stores outputs (code, docs, etc.)
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  integer,
  numeric,
  pgEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================================================
// ENUMS
// ============================================================================

export const projectStatusEnum = pgEnum('project_status', [
  'planning',      // Initial requirements gathering
  'active',        // In development
  'paused',        // Temporarily stopped
  'completed',     // Successfully finished
  'cancelled',     // Abandoned
]);

export const taskStatusEnum = pgEnum('task_status', [
  'pending',            // Created but not yet queued
  'queued',             // Ready to be picked up by an agent
  'running',            // Agent is working on it
  'waiting_human',      // Blocked on human input
  'processing_answer',  // Human provided answer, being processed
  'blocked',            // Blocked on dependency
  'completed',          // Successfully finished
  'failed',             // Failed after retries exhausted
  'cancelled',          // Cancelled by user
]);

export const taskPriorityEnum = pgEnum('task_priority', [
  'critical',      // Drop everything
  'high',          // Do soon
  'medium',        // Normal priority
  'low',           // Nice to have
]);

export const agentTypeEnum = pgEnum('agent_type', [
  'orchestrator',
  'backend',
  'frontend',
  'qa',
  'devops',
  'feedback',
  'scoper',
  'client-reporter',
]);

export const questionStatusEnum = pgEnum('question_status', [
  'pending',       // Waiting for human
  'answered',      // Human provided answer
  'dismissed',     // Human dismissed without answer
  'expired',       // Timed out
]);

export const questionPriorityEnum = pgEnum('question_priority', [
  'blocking',      // Task cannot continue
  'important',     // Should answer soon
  'informational', // Nice to know
]);

export const artifactTypeEnum = pgEnum('artifact_type', [
  'code',          // Source code files
  'test',          // Test files
  'config',        // Configuration files
  'doc',           // Documentation
  'migration',     // Database migrations
  'asset',         // Static assets
  'log',           // Execution logs
]);

export const environmentEnum = pgEnum('environment', [
  'local',
  'dev',
  'test',
  'staging',
  'production',
]);

// ============================================================================
// SHARED TYPES
// ============================================================================

export interface ImageAttachment {
  url: string;        // local file path: generated/uploads/{taskId}/{filename}
  mimeType: string;   // image/png, image/jpeg, image/webp, image/gif
  name: string;       // original filename (sanitized)
}

// ============================================================================
// PROJECTS
// ============================================================================

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Basic info
  name: text('name').notNull(),
  description: text('description'),
  
  // Status
  status: projectStatusEnum('status').notNull().default('planning'),
  
  // Configuration
  config: jsonb('config').$type<{
    techStack?: string[];
    environments?: string[];
    repository?: string;
    branch?: string;
  }>().default({}),
  
  // Consulting pipeline (Phase 6)
  clientId: uuid('client_id').references((): any => clients.id),
  scopeId: uuid('scope_id').references((): any => projectScopes.id),
  currentMilestone: text('current_milestone'),
  billingStatus: text('billing_status').default('not_started'),

  // Metadata
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => ({
  nameIdx: index('projects_name_idx').on(table.name),
  statusIdx: index('projects_status_idx').on(table.status),
}));

// ============================================================================
// TASKS
// ============================================================================

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Relationships
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  parentTaskId: uuid('parent_task_id').references((): any => tasks.id, { onDelete: 'set null' }),
  
  // Basic info
  name: text('name').notNull(),
  description: text('description').notNull(),
  
  // Assignment
  agentType: agentTypeEnum('agent_type').notNull(),
  assignedAgentId: text('assigned_agent_id'), // Runtime agent instance ID
  
  // Status
  status: taskStatusEnum('status').notNull().default('pending'),
  priority: taskPriorityEnum('priority').notNull().default('medium'),
  
  // Dependencies (task IDs that must complete before this task can start)
  dependsOn: uuid('depends_on').array(),
  
  // Files this task will modify (for lock acquisition)
  filesToModify: text('files_to_modify').array(),
  
  // Quality gates that must pass
  requiredGates: text('required_gates').array(),
  
  // Input context for the agent
  context: jsonb('context').$type<{
    requirements?: string;
    acceptanceCriteria?: string[];
    relatedFiles?: string[];
    previousAttempts?: { attemptNumber: number; error: string; timestamp: string }[];
    answeredQuestions?: { question: string; answer: string }[];
    // Blocking state (set when dependency fails)
    blockedReason?: string | null;
    blockedByTaskId?: string | null;
    blockedAt?: string | null;
    unblockedAt?: string | null;
    // Syntax recovery tracking
    syntaxRecoveryAttempts?: { fixLoops: number; fullRetries: number; fixTokensUsed: number };
    finalSyntaxErrors?: Array<{ file: string; line?: number; message: string }>;
  }>().default({}),
  
  // Output
  result: jsonb('result').$type<{
    success: boolean;
    summary?: string;
    artifactIds?: string[];
    prUrl?: string;
    error?: string;
    outputs?: {
      generatedDir?: string;
      files?: string[];
      warnings?: Array<{ file: string; line?: number; message: string }>;
    };
  }>(),
  
  // Retry tracking (3-strike rule)
  attemptCount: integer('attempt_count').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  
  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  processingStartedAt: timestamp('processing_started_at', { withTimezone: true }),

  // Archive flag
  archived: boolean('archived').default(false),

  // Syntax validation warnings (stored separately for easy querying)
  warnings: jsonb('warnings').$type<Array<{ file: string; line?: number; message: string }>>(),

  // Token consumption metrics for tracking API usage
  tokenMetrics: jsonb('token_metrics').$type<{
    inputTokens?: number;
    outputTokens?: number;
    skillTokens?: number;
    contextTokens?: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
    cacheHitPercent?: number;
    estimatedSavingsPercent?: number;
  }>(),

  // Technical spec (architect layer output)
  technicalSpec: text('technical_spec'),
  techSpecGeneratedAt: timestamp('tech_spec_generated_at', { withTimezone: true }),
  techSpecTokens: integer('tech_spec_tokens'),

  // Image attachments and extracted requirements (Phase 5.7)
  imageAttachments: jsonb('image_attachments').$type<ImageAttachment[]>(),
  imageRequirements: text('image_requirements'),
  imageRequirementsGeneratedAt: timestamp('image_requirements_generated_at', { withTimezone: true }),
  imageRequirementsTokens: integer('image_requirements_tokens'),

  // Consulting pipeline (Phase 6)
  milestoneId: uuid('milestone_id').references((): any => milestones.id),
}, (table) => ({
  projectIdx: index('tasks_project_idx').on(table.projectId),
  statusIdx: index('tasks_status_idx').on(table.status),
  agentTypeIdx: index('tasks_agent_type_idx').on(table.agentType),
  priorityIdx: index('tasks_priority_idx').on(table.priority),
  parentTaskIdx: index('tasks_parent_task_idx').on(table.parentTaskId),
  archivedIdx: index('tasks_archived_idx').on(table.archived),
}));

// ============================================================================
// QUESTIONS (Human Input Queue)
// ============================================================================

export const questions = pgTable('questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Relationships
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
  
  // Question details
  question: text('question').notNull(),
  context: text('context'), // Additional context for human
  
  // Who's asking
  askedByAgent: agentTypeEnum('asked_by_agent').notNull(),
  
  // Status and priority
  status: questionStatusEnum('status').notNull().default('pending'),
  priority: questionPriorityEnum('priority').notNull().default('important'),
  
  // Is this blocking the task?
  isBlocking: boolean('is_blocking').notNull().default(true),
  
  // Suggested answers (agent can provide options)
  suggestedAnswers: text('suggested_answers').array(),
  
  // Human's answer
  answer: text('answer'),
  answeredAt: timestamp('answered_at', { withTimezone: true }),
  
  // Metadata
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
}, (table) => ({
  projectIdx: index('questions_project_idx').on(table.projectId),
  taskIdx: index('questions_task_idx').on(table.taskId),
  statusIdx: index('questions_status_idx').on(table.status),
  priorityIdx: index('questions_priority_idx').on(table.priority),
  isBlockingIdx: index('questions_is_blocking_idx').on(table.isBlocking),
}));

// ============================================================================
// FILE LOCKS
// ============================================================================

export const fileLocks = pgTable('file_locks', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // What's locked
  filePath: text('file_path').notNull(),
  
  // Who has the lock
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  agentType: agentTypeEnum('agent_type').notNull(),
  
  // Git context
  branch: text('branch').notNull(),
  
  // Timing
  lockedAt: timestamp('locked_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  
  // For debugging/audit
  reason: text('reason'),
}, (table) => ({
  filePathIdx: uniqueIndex('file_locks_file_path_idx').on(table.filePath),
  taskIdx: index('file_locks_task_idx').on(table.taskId),
  expiresAtIdx: index('file_locks_expires_at_idx').on(table.expiresAt),
}));

// ============================================================================
// ARTIFACTS
// ============================================================================

export const artifacts = pgTable('artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Relationships
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
  
  // Artifact info
  type: artifactTypeEnum('type').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  
  // Location
  filePath: text('file_path'), // Path in repo
  gitCommit: text('git_commit'), // Commit SHA
  gitBranch: text('git_branch'),
  
  // For non-git artifacts (logs, etc.)
  content: text('content'),
  
  // Metadata
  metadata: jsonb('metadata').$type<{
    size?: number;
    mimeType?: string;
    checksum?: string;
    language?: string;
  }>().default({}),
  
  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdByAgent: agentTypeEnum('created_by_agent'),
}, (table) => ({
  projectIdx: index('artifacts_project_idx').on(table.projectId),
  taskIdx: index('artifacts_task_idx').on(table.taskId),
  typeIdx: index('artifacts_type_idx').on(table.type),
}));

// ============================================================================
// ENVIRONMENT DEPLOYMENTS
// ============================================================================

export const deployments = pgTable('deployments', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Relationships
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  
  // Deployment info
  environment: environmentEnum('environment').notNull(),
  gitCommit: text('git_commit').notNull(),
  gitBranch: text('git_branch').notNull(),
  
  // Status
  status: text('status').notNull().$type<'pending' | 'deploying' | 'deployed' | 'failed' | 'rolled_back'>(),
  
  // Quality gates passed
  gatesPassed: text('gates_passed').array(),
  
  // Human approval (required for production)
  requiresApproval: boolean('requires_approval').notNull().default(false),
  approvedBy: text('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  
  // Deployment details
  deployUrl: text('deploy_url'),
  deployLog: text('deploy_log'),
  
  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deployedAt: timestamp('deployed_at', { withTimezone: true }),
}, (table) => ({
  projectIdx: index('deployments_project_idx').on(table.projectId),
  environmentIdx: index('deployments_environment_idx').on(table.environment),
  statusIdx: index('deployments_status_idx').on(table.status),
}));

// ============================================================================
// AGENT SESSIONS (for tracking active agents)
// ============================================================================

export const agentSessions = pgTable('agent_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Agent info
  agentType: agentTypeEnum('agent_type').notNull(),
  agentInstanceId: text('agent_instance_id').notNull(), // Unique ID for this runtime instance
  
  // Current state
  status: text('status').notNull().$type<'idle' | 'working' | 'waiting' | 'offline'>(),
  currentTaskId: uuid('current_task_id').references(() => tasks.id, { onDelete: 'set null' }),
  
  // Stats
  tasksCompleted: integer('tasks_completed').notNull().default(0),
  tasksFailed: integer('tasks_failed').notNull().default(0),
  
  // Timestamps
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  lastHeartbeat: timestamp('last_heartbeat', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  agentTypeIdx: index('agent_sessions_agent_type_idx').on(table.agentType),
  statusIdx: index('agent_sessions_status_idx').on(table.status),
  instanceIdx: uniqueIndex('agent_sessions_instance_idx').on(table.agentInstanceId),
}));

// ============================================================================
// CLIENTS (Consulting Pipeline)
// ============================================================================

export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  contactName: text('contact_name'),
  contactEmail: text('contact_email'),
  notes: text('notes'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ============================================================================
// PROJECT BRIEFS
// ============================================================================

export const projectBriefs = pgTable('project_briefs', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').references(() => clients.id),
  title: text('title').notNull(),
  rawContent: text('raw_content').notNull(),
  status: text('status').notNull().default('received'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ============================================================================
// PROJECT SCOPES
// ============================================================================

export const projectScopes = pgTable('project_scopes', {
  id: uuid('id').primaryKey().defaultRandom(),
  briefId: uuid('brief_id').references(() => projectBriefs.id).notNull(),
  projectId: uuid('project_id').references(() => projects.id),
  scopeData: jsonb('scope_data').notNull(),
  clientDocument: text('client_document'),
  estimatedTasks: integer('estimated_tasks'),
  estimatedDuration: text('estimated_duration'),
  riskLevel: text('risk_level'),
  status: text('status').notNull().default('draft'),
  approvedBy: text('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ============================================================================
// MILESTONES
// ============================================================================

export const milestones = pgTable('milestones', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  deliverables: jsonb('deliverables'),
  targetDate: text('target_date'),
  status: text('status').notNull().default('pending'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ============================================================================
// CLIENT REPORTS
// ============================================================================

export const clientReports = pgTable('client_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id).notNull(),
  reportType: text('report_type').notNull(),
  reportContent: text('report_content').notNull(),
  internalNotes: text('internal_notes'),
  period: text('period'),
  status: text('status').notNull().default('draft'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ============================================================================
// COST TRACKING
// ============================================================================

export const costTracking = pgTable('cost_tracking', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id).notNull(),
  taskId: uuid('task_id').references(() => tasks.id),
  agentType: text('agent_type').notNull(),
  tokensInput: integer('tokens_input').notNull(),
  tokensOutput: integer('tokens_output').notNull(),
  cachedTokens: integer('cached_tokens').default(0),
  apiCostUsd: numeric('api_cost_usd', { precision: 10, scale: 4 }),
  estimatedBillableHours: numeric('estimated_billable_hours', { precision: 6, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ============================================================================
// RELATIONS
// ============================================================================

export const projectsRelations = relations(projects, ({ one, many }) => ({
  tasks: many(tasks),
  questions: many(questions),
  artifacts: many(artifacts),
  deployments: many(deployments),
  client: one(clients, {
    fields: [projects.clientId],
    references: [clients.id],
  }),
  scope: one(projectScopes, {
    fields: [projects.scopeId],
    references: [projectScopes.id],
  }),
  milestones: many(milestones),
  clientReports: many(clientReports),
  costTracking: many(costTracking),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  parentTask: one(tasks, {
    fields: [tasks.parentTaskId],
    references: [tasks.id],
    relationName: 'subtasks',
  }),
  subtasks: many(tasks, { relationName: 'subtasks' }),
  questions: many(questions),
  artifacts: many(artifacts),
  fileLocks: many(fileLocks),
  milestone: one(milestones, {
    fields: [tasks.milestoneId],
    references: [milestones.id],
  }),
  costEntries: many(costTracking),
}));

export const questionsRelations = relations(questions, ({ one }) => ({
  project: one(projects, {
    fields: [questions.projectId],
    references: [projects.id],
  }),
  task: one(tasks, {
    fields: [questions.taskId],
    references: [tasks.id],
  }),
}));

export const fileLocksRelations = relations(fileLocks, ({ one }) => ({
  task: one(tasks, {
    fields: [fileLocks.taskId],
    references: [tasks.id],
  }),
}));

export const artifactsRelations = relations(artifacts, ({ one }) => ({
  project: one(projects, {
    fields: [artifacts.projectId],
    references: [projects.id],
  }),
  task: one(tasks, {
    fields: [artifacts.taskId],
    references: [tasks.id],
  }),
}));

export const deploymentsRelations = relations(deployments, ({ one }) => ({
  project: one(projects, {
    fields: [deployments.projectId],
    references: [projects.id],
  }),
}));

export const agentSessionsRelations = relations(agentSessions, ({ one }) => ({
  currentTask: one(tasks, {
    fields: [agentSessions.currentTaskId],
    references: [tasks.id],
  }),
}));

// Consulting pipeline relations

export const clientsRelations = relations(clients, ({ many }) => ({
  projects: many(projects),
  briefs: many(projectBriefs),
}));

export const projectBriefsRelations = relations(projectBriefs, ({ one }) => ({
  client: one(clients, {
    fields: [projectBriefs.clientId],
    references: [clients.id],
  }),
  scope: one(projectScopes),
}));

export const projectScopesRelations = relations(projectScopes, ({ one }) => ({
  brief: one(projectBriefs, {
    fields: [projectScopes.briefId],
    references: [projectBriefs.id],
  }),
  project: one(projects, {
    fields: [projectScopes.projectId],
    references: [projects.id],
  }),
}));

export const milestonesRelations = relations(milestones, ({ one, many }) => ({
  project: one(projects, {
    fields: [milestones.projectId],
    references: [projects.id],
  }),
  tasks: many(tasks),
}));

export const clientReportsRelations = relations(clientReports, ({ one }) => ({
  project: one(projects, {
    fields: [clientReports.projectId],
    references: [projects.id],
  }),
}));

export const costTrackingRelations = relations(costTracking, ({ one }) => ({
  project: one(projects, {
    fields: [costTracking.projectId],
    references: [projects.id],
  }),
  task: one(tasks, {
    fields: [costTracking.taskId],
    references: [tasks.id],
  }),
}));
