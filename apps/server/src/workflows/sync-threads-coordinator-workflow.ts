/*
 * Licensed to Zero Email Inc. under one or more contributor license agreements.
 * You may not use this file except in compliance with the Apache License, Version 2.0 (the "License").
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Reuse or distribution of this file requires a license from Zero Email Inc.
 */
import { connectionToDriver } from '../lib/server-utils';
import { connection } from '../db/schema';
import type { ZeroEnv } from '../env';
import { eq } from 'drizzle-orm';
import { createDb } from '../db';

export interface SyncThreadsCoordinatorParams {
  connectionId: string;
  folder: string;
}

export interface SyncThreadsCoordinatorResult {
  totalSynced: number;
  message: string;
  folder: string;
  totalPagesProcessed: number;
  totalThreads: number;
  totalSuccessfulSyncs: number;
  totalFailedSyncs: number;
  pageWorkflowResults: Array<{
    pageNumber: number;
    workflowId: string;
    status: 'completed' | 'failed';
    synced: number;
    error?: string;
  }>;
}

export async function syncThreadsCoordinatorWorkflow(
  env: ZeroEnv,
  params: SyncThreadsCoordinatorParams,
): Promise<SyncThreadsCoordinatorResult> {
  const { connectionId, folder } = params;

  console.info(`[SyncThreadsCoordinatorWorkflow] Starting coordination for connection ${connectionId}, folder ${folder}`);

  const result: SyncThreadsCoordinatorResult = {
    totalSynced: 0,
    message: 'Coordination completed',
    folder,
    totalPagesProcessed: 0,
    totalThreads: 0,
    totalSuccessfulSyncs: 0,
    totalFailedSyncs: 0,
    pageWorkflowResults: [],
  };

  const { db, conn } = createDb(env.HYPERDRIVE.connectionString);

  const foundConnection = await db.query.connection.findFirst({
    where: eq(connection.id, connectionId),
  });

  await conn.end();

  if (!foundConnection) {
    throw new Error(`Connection ${connectionId} not found`);
  }

  const maxCount = parseInt(env.THREAD_SYNC_MAX_COUNT || '20');
  const shouldLoop = env.THREAD_SYNC_LOOP === 'true';

  const driver = connectionToDriver(foundConnection);

  if (connectionId.includes('aggregate')) {
    console.info(`[SyncThreadsCoordinatorWorkflow] Skipping sync for aggregate instance - folder ${folder}`);
    result.message = 'Skipped aggregate instance';
    return result;
  }

  if (!driver) {
    console.warn(`[SyncThreadsCoordinatorWorkflow] No driver available for folder ${folder}`);
    result.message = 'No driver available';
    return result;
  }

  // Process pages sequentially
  let currentPageToken: string | null = null;
  let pageNumber = 0;

  do {
    pageNumber++;

    console.info(`[SyncThreadsCoordinatorWorkflow] Processing page ${pageNumber} for ${folder}`);

    // Call the actual function directly instead of using Cloudflare Workflows
    const { syncThreadsWorkflow } = await import('./sync-threads-workflow');
    const pageResult = await syncThreadsWorkflow(env, {
      connectionId,
      folder,
      pageNumber,
      pageToken: currentPageToken,
      maxCount,
      singlePageMode: true,
    });

    if (pageResult) {
      result.pageWorkflowResults.push({
        pageNumber,
        workflowId: `local-${pageNumber}`,
        status: 'completed',
        synced: pageResult.synced || 0,
      });

      result.totalSynced += pageResult.synced || 0;
      result.totalPagesProcessed += 1;
      result.totalThreads += pageResult.totalThreads || 0;
      result.totalSuccessfulSyncs += pageResult.successfulSyncs || 0;
      result.totalFailedSyncs += pageResult.failedSyncs || 0;

      // Get next page token from workflow result if available
      currentPageToken = pageResult.nextPageToken || null;
    } else {
      break;
    }

    // If no more pages, stop
    if (!currentPageToken) {
      console.info(`[SyncThreadsCoordinatorWorkflow] No more pages for ${folder}`);
      break;
    }
  } while (currentPageToken && shouldLoop);

  console.info(
    `[SyncThreadsCoordinatorWorkflow] Completed ${folder}: ${result.totalSynced} synced across ${result.totalPagesProcessed} pages`,
  );

  return result;
}
