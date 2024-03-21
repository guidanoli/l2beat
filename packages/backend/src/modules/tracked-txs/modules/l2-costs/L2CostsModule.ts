import { Logger } from '@l2beat/backend-tools'
import { createPublicClient, http } from 'viem'

import { Config } from '../../../../config'
import { IndexerStateRepository } from '../../../../peripherals/database/repositories/IndexerStateRepository'
import { Peripherals } from '../../../../peripherals/Peripherals'
import { ViemRpcClient } from '../../../../peripherals/viem-rpc-client/ViemRpcClient'
import { Clock } from '../../../../tools/Clock'
import { ApplicationModuleWithUpdater } from '../../../ApplicationModule'
import { PriceRepository } from '../../../tvl/repositories/PriceRepository'
import { L2CostsController } from './api/L2CostsController'
import { createL2CostsRouter } from './api/L2CostsRouter'
import { L2CostsUpdater } from './L2CostsUpdater'
import { L2CostsRepository } from './repositories/L2CostsRepository'

export function createL2CostsModule(
  config: Config,
  logger: Logger,
  peripherals: Peripherals,
  clock: Clock,
): ApplicationModuleWithUpdater<L2CostsUpdater> | undefined {
  if (!config.trackedTxsConfig || !config.trackedTxsConfig.uses.l2costs) {
    logger.info('L2Costs module disabled')
    return
  }

  const publicClient = createPublicClient({
    transport: http(config.trackedTxsConfig.uses.l2costs.providerUrl),
  })
  const viemRpcClient = new ViemRpcClient(
    publicClient,
    logger,
    config.trackedTxsConfig.uses.l2costs.providerCallsPerMinute,
  )

  const l2CostsUpdater = new L2CostsUpdater(
    peripherals.getRepository(L2CostsRepository),
    viemRpcClient,
    logger,
  )

  const l2CostsController = new L2CostsController(
    peripherals.getRepository(L2CostsRepository),
    peripherals.getRepository(PriceRepository),
    peripherals.getRepository(IndexerStateRepository),
    config.projects,
    clock,
    logger,
  )
  const l2CostsRouter = createL2CostsRouter(l2CostsController)

  const start = () => {
    logger = logger.for('L2CostsModule')
    logger.info('Starting...')
  }

  return {
    start,
    routers: [l2CostsRouter],
    updater: l2CostsUpdater,
  }
}
