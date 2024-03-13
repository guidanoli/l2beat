import { Logger } from '@l2beat/backend-tools'
import { EthereumAddress, UnixTime } from '@l2beat/shared-pure'
import { PricesRow } from 'knex/types/tables'

import {
  BaseRepository,
  CheckConvention,
} from '../../../peripherals/database/BaseRepository'
import { Database } from '../../../peripherals/database/Database'

export interface PricesRecord {
  chain: string
  address: EthereumAddress | 'native'
  timestamp: UnixTime
  priceUsd: number
}

export class PricesRepository extends BaseRepository {
  constructor(database: Database, logger: Logger) {
    super(database, logger)
    this.autoWrap<CheckConvention<PricesRepository>>(this)
  }

  async getAll(): Promise<PricesRecord[]> {
    const knex = await this.knex()
    const rows = await knex('prices')
    return rows.map(toRecord)
  }

  async addMany(prices: PricesRecord[]) {
    const rows: PricesRow[] = prices.map(toRow)
    const knex = await this.knex()
    await knex.batchInsert('prices', rows, 10_000)
    return rows.length
  }

  async deleteAll() {
    const knex = await this.knex()
    return knex('prices').delete()
  }
}

function toRecord(row: PricesRow): PricesRecord {
  return {
    chain: row.chain,
    address: row.address === 'native' ? 'native' : EthereumAddress(row.address),
    timestamp: UnixTime.fromDate(row.timestamp),
    priceUsd: +row.price_usd,
  }
}

function toRow(record: PricesRecord): PricesRow {
  return {
    chain: record.chain,
    address: record.address === 'native' ? 'native' : record.address.toString(),
    timestamp: record.timestamp.toDate(),
    price_usd: record.priceUsd,
  }
}