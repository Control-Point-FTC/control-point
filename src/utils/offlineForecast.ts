// Offline Predict (V3.5 phase 6b): the same Forecaster the server runs, fed
// from the offline pack's ratings, model and advancement records, so an
// event in the pack can be forecast on the device with no connection.
import { Forecaster, normType, type AdvancementRecord, type PredictModel } from '../../server/predict/forecast';
import { RatingBook } from '../../server/predict/rating';
import type { AwardRecord } from '../../server/predict/awards';
import type { OfflinePack, OfflinePredict } from '../types/offlinePack';
import { PartnershipTable } from '@control-scout/predict-engine';

/** Fewer runs than the server (2000): the device may be a phone. */
export const OFFLINE_RUNS = 1000;

export class OfflineForecaster extends Forecaster {
  protected readonly model: PredictModel;
  protected readonly awardHistory: Map<number, AwardRecord[]>;
  private readonly seasonBook: RatingBook;
  private readonly regions: Map<string, string>;
  private readonly played: Map<string, Set<string>>;
  private readonly pairTable: PartnershipTable | null;

  constructor(private pack: OfflinePack & { predict: OfflinePredict }) {
    super();
    this.model = pack.predict.model;
    this.awardHistory = new Map(pack.predict.awards);
    this.seasonBook = RatingBook.fromData(pack.predict.book);
    this.regions = new Map(pack.events.filter((e) => e.region).map((e) => [e.code, e.region!]));
    // Results the ratings already include; any other played result in the pack
    // is folded in on the device (Forecaster.eventBook).
    this.played = new Map(Object.entries(pack.predict.played ?? {}).map(([c, keys]) => [c, new Set(keys)]));
    this.pairTable = PartnershipTable.fromData(pack.predict.partnerships);
  }

  /** Pair history the pack carries (engine 2.2), for its season only, as on the server. */
  protected partnerships(season: number): PartnershipTable | null {
    return this.pairTable && this.pairTable.season === season ? this.pairTable : null;
  }

  protected book(season: number): RatingBook | null {
    if (season !== this.pack.season) return null;
    const b = this.seasonBook.clone();
    b.setTime(Date.now());
    return b;
  }
  protected hasRatings(): boolean { return true; }
  storedPlayedKeys(season: number, code: string): Set<string> {
    return season === this.pack.season ? this.played.get(code) ?? new Set() : new Set();
  }
  protected advancementRecords(season: number): AdvancementRecord[] { return this.pack.predict.advancement[season] ?? []; }
  protected regionOf(code: string): string | null { return this.regions.get(code) ?? null; }
  /** Recorded bonus RPs the pack carries (packs from before engine 2.0 have none: sampled). */
  protected recordedBonus(season: number, code: string, key: string, side: 'red' | 'blue') {
    if (season !== this.pack.season) return null;
    return this.pack.predict.bonus?.[code]?.[key]?.[side === 'red' ? 0 : 1] ?? null;
  }
  protected awardSlots(_season: number, type: string | null) {
    return this.pack.predict.awardSlots[normType(type)] ?? [{ type: 'Inspire', placement: 1 }, { type: 'Inspire', placement: 2 }];
  }
}

const forecasters = new WeakMap<OfflinePack, OfflineForecaster>();
/** The pack's forecaster (null when the pack has no ratings), built once per pack. */
export function offlineForecaster(pack: OfflinePack): OfflineForecaster | null {
  if (!pack.predict) return null;
  let f = forecasters.get(pack);
  if (!f) { f = new OfflineForecaster(pack as OfflinePack & { predict: OfflinePredict }); forecasters.set(pack, f); }
  return f;
}

