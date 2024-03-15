import { Logger } from '@l2beat/backend-tools'
import { assert, assertUnreachable, notUndefined } from '@l2beat/shared-pure'
import { ethers } from 'ethers'

import { Config } from '../../config'
import { FinalityProjectConfig } from '../../config/features/finality'
import { Database } from '../../peripherals/database/Database'
import { IndexerStateRepository } from '../../peripherals/database/repositories/IndexerStateRepository'
import { RpcClient } from '../../peripherals/rpcclient/RpcClient'
import { Clock } from '../../tools/Clock'
import { ApplicationModule } from '../ApplicationModule'
import { LivenessRepository } from '../liveness/repositories/LivenessRepository'
import { TrackedTxsIndexer } from '../tracked-txs/TrackedTxsIndexer'
import { LineaFinalityAnalyzer } from './analyzers/LineaFinalityAnalyzer'
import { zkSyncEraFinalityAnalyzer } from './analyzers/zkSyncEraFinalityAnalyzer'
import { FinalityController } from './api/FinalityController'
import { createFinalityRouter } from './api/FinalityRouter'
import { FinalityIndexer } from './FinalityIndexer'
import { FinalityRepository } from './repositories/FinalityRepository'

export function createFinalityModule(
  config: Config,
  logger: Logger,
  database: Database,
  clock: Clock,
  trackedTxsIndexer: TrackedTxsIndexer | undefined,
): ApplicationModule | undefined {
  if (!config.finality) {
    logger.info('Finality module disabled')
    return
  }

  if (!trackedTxsIndexer) {
    logger.error('To run finality you have to run tracked transactions module')
    return
  }

  const indexerStateRepository = new IndexerStateRepository(database, logger)
  const livenessRepository = new LivenessRepository(database, logger)
  const finalityRepository = new FinalityRepository(database, logger)

  const finalityController = new FinalityController(
    livenessRepository,
    finalityRepository,
    config.finality.configurations,
  )
  const finalityRouter = createFinalityRouter(finalityController)

  const ethereumProvider = new ethers.providers.JsonRpcProvider(
    config.finality.ethereumProviderUrl,
  )
  const ethereumRPC = new RpcClient(
    ethereumProvider,
    logger,
    config.finality.ethereumProviderCallsPerMinute,
  )

  const runtimeConfigurations = initializeConfigurations(
    ethereumRPC,
    livenessRepository,
    config.finality.configurations,
    logger,
  )

  const finalityIndexers = runtimeConfigurations.map(
    (runtimeConfiguration) =>
      new FinalityIndexer(
        logger,
        trackedTxsIndexer,
        indexerStateRepository,
        finalityRepository,
        runtimeConfiguration,
      ),
  )

  const start = async () => {
    logger = logger.for('FinalityModule')
    logger.info('Starting...')

    for (const finalityIndexer of finalityIndexers) {
      await finalityIndexer.start()
    }
  }

  return {
    start,
    routers: [finalityRouter],
  }
}

function initializeConfigurations(
  ethereumRPC: RpcClient,
  livenessRepository: LivenessRepository,
  configs: FinalityProjectConfig[],
  logger: Logger,
) {
  return configs
    .map((configuration) => {
      switch (configuration.type) {
        case 'Linea':
          return {
            projectId: configuration.projectId,
            analyzer: new LineaFinalityAnalyzer(
              ethereumRPC,
              livenessRepository,
              configuration.projectId,
              getL2RPC(configuration, logger),
            ),
            minTimestamp: configuration.minTimestamp,
          }
        case 'zkSyncEra':
          return {
            projectId: configuration.projectId,
            analyzer: new zkSyncEraFinalityAnalyzer(
              ethereumRPC,
              livenessRepository,
              configuration.projectId,
            ),
            minTimestamp: configuration.minTimestamp,
          }
        case 'OPStack':
          return
        default:
          assertUnreachable(configuration)
      }
    })
    .filter(notUndefined)
}

function getL2RPC(configuration: FinalityProjectConfig, logger: Logger) {
  assert(
    configuration.url,
    `${configuration.projectId.toString()}: L2 provider URL is not defined`,
  )
  const L2provider = new ethers.providers.JsonRpcProvider(configuration.url)
  return new RpcClient(L2provider, logger, configuration.callsPerMinute)
}
