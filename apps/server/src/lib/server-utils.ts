import type { IGetThreadResponse, IGetThreadsResponse } from './driver/types';
import { OutgoingMessageType } from '../routes/agent/types';
import { getContext } from 'hono/context-storage';
import { connection } from '../db/schema';
import { defaultPageSize } from './utils';
import type { HonoContext } from '../ctx';
import { createDriver } from './driver';
import { eq } from 'drizzle-orm';
import { createDb } from '../db';
import { Effect } from 'effect';
import { env } from '../env';

const mbToBytes = (mb: number) => mb * 1024 * 1024;
const MAX_SHARD_SIZE = mbToBytes(8192);

export const getZeroDB = async (userId: string) => {
  const { ZeroDB } = await import('../main');
  const zeroDb = new ZeroDB(env);
  return zeroDb.setMetaData(userId);
};

export const getRegistryClient = async (connectionId: string) => {
  const { ShardRegistry } = await import('../routes/agent/index');
  return new ShardRegistry(env);
};

export const getShardClient = async (connectionId: string, shardId?: string) => {
  const { ZeroDriver } = await import('../routes/agent/index');
  const driver = new ZeroDriver(env);
  await driver.setName(connectionId);
  return driver;
};

export const getZeroDriver = async (connectionId: string) => {
  const { ZeroDriver } = await import('../routes/agent/index');
  const driver = new ZeroDriver(env);
  await driver.setName(connectionId);
  return driver;
};

export const aggregateShardDataEffect = <T, E = never>(
  connectionId: string,
  shardOperation: (shard: any) => Effect.Effect<T, E>,
  aggregator: (results: T[]) => T,
) => {
  return Effect.gen(function* () {
    const shard = yield* Effect.tryPromise({
      try: () => getShardClient(connectionId),
      catch: (error) => new Error(`Failed to get shard client: ${error}`),
    });

    const result = yield* shardOperation(shard).pipe(
      Effect.catchAll((error) =>
        Effect.fail(new Error(`Operation failed on shard: ${error}`)),
      ),
    );

    return aggregator([result]);
  });
};

export const aggregateShardDataSequentialEffect = <T, A, E = never>(
  connectionId: string,
  shardOperation: (
    shard: any,
    shardId: string,
    accumulator: A,
  ) => Effect.Effect<{ shouldContinue: boolean; accumulator: A }, E>,
  initialAccumulator: A,
  finalizer: (accumulator: A) => T,
) => {
  return Effect.gen(function* () {
    const shard = yield* Effect.tryPromise({
      try: () => getShardClient(connectionId),
      catch: (error) => new Error(`Failed to get shard client: ${error}`),
    });

    const { accumulator: newAccumulator } = yield* shardOperation(
      shard,
      'default',
      initialAccumulator,
    ).pipe(
      Effect.catchAll((error) =>
        Effect.fail(new Error(`Operation failed on shard: ${error}`)),
      ),
    );

    return finalizer(newAccumulator);
  });
};

export const raceShardDataEffect = <T, E = never>(
  connectionId: string,
  shardOperation: (shard: any, shardId: string) => Effect.Effect<T, E>,
  fallbackValue: T,
) => {
  return Effect.gen(function* () {
    const shard = yield* Effect.tryPromise({
      try: () => getShardClient(connectionId),
      catch: (error) => new Error(`Failed to get shard client: ${error}`),
    });

    const result = yield* shardOperation(shard, 'default').pipe(
      Effect.catchAll((error) =>
        Effect.fail(new Error(`Operation failed on shard: ${error}`)),
      ),
    );

    return { result, shardId: 'default' };
  });
};

const getThreadEffect = (connectionId: string, threadId: string) => {
  return raceShardDataEffect(
    connectionId,
    (shard, shardId) =>
      Effect.gen(function* () {
        const thread = yield* Effect.tryPromise({
          try: async () => shard.getThread(threadId, true),
          catch: (error) =>
            new Error(`Failed to get thread from shard: ${error}`),
        });

        if (thread) return thread;
        return yield* Effect.fail(new Error(`Thread ${threadId} not found`));
      }),
    null,
  );
};

export const getThread: (
  connectionId: string,
  threadId: string,
) => Promise<{ result: IGetThreadResponse; shardId: string }> = async (
  connectionId: string,
  threadId: string,
) => {
    const result = await Effect.runPromise(getThreadEffect(connectionId, threadId));
    if (!result.result) throw new Error(`Thread ${threadId} not found`);
    return { result: result.result, shardId: result.shardId };
  };

export const modifyThreadLabelsInDB = async (
  connectionId: string,
  threadId: string,
  addLabels: string[],
  removeLabels: string[],
) => {
  const shard = await getShardClient(connectionId);
  await shard.modifyLabels([threadId], addLabels, removeLabels);

  const agent = await getZeroSocketAgent(connectionId);
  // await agent.invalidateDoStateCache();
  
  await sendDoState(connectionId);
};

export const getZeroAgent = async (connectionId: string, executionCtx?: any) => {
  const { ZeroAgent } = await import('../routes/agent/index');
  return new ZeroAgent(env, connectionId);
};

export const getZeroAgentFromShard = async (connectionId: string, shardId: string) => {
  return getZeroAgent(connectionId);
};

export const forceReSync = async (connectionId: string) => {
  const driver = await getZeroDriver(connectionId);
  return driver.forceReSync();
};

export const reSyncThread = async (connectionId: string, threadId: string) => {
  try {
    const driver = await getZeroDriver(connectionId);
    // await driver.syncThread({ threadId });
  } catch (error) {
    console.error(`[ZeroAgent] Thread not found for threadId: ${threadId}`, error);
  }
};

export const getThreadsFromDB = async (
  connectionId: string,
  params: {
    labelIds?: string[];
    folder?: string;
    q?: string;
    maxResults?: number;
    pageToken?: string;
  },
): Promise<IGetThreadsResponse> => {
  void sendDoState(connectionId);

  const maxResults = params.maxResults ?? defaultPageSize;
  const shard = await getShardClient(connectionId);
  
  return await shard.rawListThreads({
    ...params,
    folder: params.folder ?? 'inbox',
    query: params.q,
    maxResults: maxResults,
  });
};

export const getDatabaseSize = async (connectionId: string): Promise<number> => {
  const shard = await getShardClient(connectionId);
  return await shard.getDatabaseSize();
};

export const deleteAllSpam = async (connectionId: string) => {
  const shard = await getShardClient(connectionId);
  return await shard.deleteAllSpam();
};

type CountResult = { label: string; count: number };

const getCounts = async (connectionId: string): Promise<CountResult[]> => {
  return []; // Simplified for now since count doesn't exist on driver yet
};

export const sendDoState = async (connectionId: string) => {
  try {
    const agent = await getZeroSocketAgent(connectionId);
    const size = await getDatabaseSize(connectionId);
    const counts = await getCounts(connectionId);

    return agent.broadcast({
      type: OutgoingMessageType.Do_State,
      isSyncing: false,
      syncingFolders: ['inbox'],
      storageSize: size,
      counts,
      shards: 1,
    } as any);
  } catch (error) {
    console.error(`[sendDoState] Failed to send do state for connection ${connectionId}:`, error);
  }
};

export const getZeroSocketAgent = async (connectionId: string) => {
  return getZeroAgent(connectionId);
};

export const getActiveConnection = async () => {
  const c = getContext<HonoContext>();
  const { sessionUser, auth } = c.var;
  if (!sessionUser) throw new Error('Session Not Found');

  const db = await getZeroDB(sessionUser.id);
  const userData = await db.findUser();

  if (userData?.defaultConnectionId) {
    const activeConnection = await db.findUserConnection(userData.defaultConnectionId);
    if (activeConnection) return activeConnection;
  }

  const firstConnection = await db.findFirstConnection();
  if (!firstConnection) {
    throw new Error('No connections found for user');
  }

  return firstConnection;
};

export const connectionToDriver = (activeConnection: typeof connection.$inferSelect) => {
  if (!activeConnection.accessToken || !activeConnection.refreshToken) {
    throw new Error(`Invalid connection ${JSON.stringify(activeConnection?.id)}`);
  }

  return createDriver(activeConnection.providerId as any, {
    auth: {
      userId: activeConnection.userId,
      accessToken: activeConnection.accessToken,
      refreshToken: activeConnection.refreshToken,
      email: activeConnection.email,
    },
  });
};

export const verifyToken = async (token: string) => {
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to verify token: ${await response.text()}`);
  }

  const data = (await response.json()) as any;
  return !!data;
};

export const resetConnection = async (connectionId: string) => {
  const { db, conn } = createDb(env.HYPERDRIVE.connectionString);
  await db
    .update(connection)
    .set({
      accessToken: null,
      refreshToken: null,
    })
    .where(eq(connection.id, connectionId));
  await conn.end();
};
