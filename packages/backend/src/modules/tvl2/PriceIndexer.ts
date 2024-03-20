import { assert, Logger } from '@l2beat/backend-tools'
import {
  CoingeckoQueryService,
  MAX_DAYS_FOR_HOURLY_PRECISION,
} from '@l2beat/shared'
import { PriceConfigEntry, UnixTime } from '@l2beat/shared-pure'
import { ChildIndexer } from '@l2beat/uif'
import { Knex } from 'knex'

import { IndexerStateRepository } from '../../peripherals/database/repositories/IndexerStateRepository'
import { HourlyIndexer } from '../tracked-txs/HourlyIndexer'
import { PriceRecord, PriceRepository } from './repositories/PriceRepository'
import { SyncOptimizer } from './SyncOptimizer'

export class PriceIndexer extends ChildIndexer {
  indexerId: string

  constructor(
    logger: Logger,
    parentIndexer: HourlyIndexer,
    private readonly coingeckoQueryService: CoingeckoQueryService,
    private readonly stateRepository: IndexerStateRepository,
    private readonly priceRepository: PriceRepository,
    private readonly token: PriceConfigEntry,
    private readonly syncOptimizer: SyncOptimizer,
  ) {
    super(logger, [parentIndexer])
    this.indexerId = `price_indexer_${token.chain}_${token.address.toString()}`
  }

  override async start(): Promise<void> {
    this.logger.info('Starting...')
    await this.initialize()
    await super.start()
    this.logger.info('Started')
  }

  override async update(_from: number, _to: number): Promise<number> {
    this.logger.info('Updating...')

    const from = this.token.sinceTimestamp.gt(new UnixTime(_from))
      ? this.token.sinceTimestamp.toEndOf('hour')
      : new UnixTime(_from).toEndOf('hour')

    const to = new UnixTime(_to).toStartOf('hour')

    if (from.gt(to)) {
      return _to
    }

    const prices = to.gt(from.add(MAX_DAYS_FOR_HOURLY_PRECISION, 'days'))
      ? await this.coingeckoQueryService.getUsdPriceHistoryHourly(
          this.token.coingeckoId,
          from,
          from.add(MAX_DAYS_FOR_HOURLY_PRECISION, 'days'),
          undefined,
        )
      : await this.coingeckoQueryService.getUsdPriceHistoryHourly(
          this.token.coingeckoId,
          from,
          to,
          undefined,
        )

    const priceRecords: PriceRecord[] = prices
      // we filter out timestamps that would be deleted by TVL cleaner
      .filter((p) => this.syncOptimizer.shouldTimestampBeSynced(p.timestamp))
      .map((price) => ({
        chain: this.token.chain,
        address: this.token.address,
        timestamp: price.timestamp,
        priceUsd: price.value,
      }))

    await this.priceRepository.addMany(priceRecords)
    this.logger.info('Updated')

    return to.gt(from.add(MAX_DAYS_FOR_HOURLY_PRECISION, 'days'))
      ? from.add(MAX_DAYS_FOR_HOURLY_PRECISION, 'days').toNumber()
      : _to
  }

  override async getSafeHeight(): Promise<number> {
    const indexerState = await this.stateRepository.findIndexerState(
      this.indexerId,
    )
    assert(indexerState, 'Indexer state should be initialized')

    return indexerState?.safeHeight
  }

  override async setSafeHeight(
    safeHeight: number,
    trx?: Knex.Transaction,
  ): Promise<void> {
    await this.stateRepository.setSafeHeight(this.indexerId, safeHeight, trx)
  }

  async initialize() {
    this.logger.info('Initializing...')

    const indexerState = await this.stateRepository.findIndexerState(
      this.indexerId,
    )

    if (indexerState === undefined) {
      await this.stateRepository.add({
        indexerId: this.indexerId,
        safeHeight: 0,
        minTimestamp: this.token.sinceTimestamp,
      })
      return
    }

    // We prevent updating the minimum timestamp of the indexer.
    // This functionality can be added in the future if needed.
    assert(
      indexerState.minTimestamp &&
        this.token.sinceTimestamp.equals(indexerState.minTimestamp),
      'Minimum timestamp of this indexer cannot be updated',
    )

    this.logger.info('Initialized')
  }

  override async invalidate(targetHeight: number): Promise<number> {
    this.logger.info('Invalidating...')

    await this.priceRepository.deleteAfterExclusive(
      this.token.chain,
      this.token.address,
      new UnixTime(targetHeight),
    )

    this.logger.info('Invalidated')

    return Promise.resolve(targetHeight)
  }
}
