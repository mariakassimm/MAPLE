import { isDuplicateKeyError } from '../../common/errors';
import { Settings, type ISettings } from './settings.model';

export async function getSettings(): Promise<ISettings> {
  const existing = await Settings.findOne({ key: 'store' }).lean<ISettings>();
  if (existing) return existing;
  try {
    return (await Settings.create({ key: 'store' })).toObject();
  } catch (err) {
    // Two first requests can race to create the document; the loser just reads the winner's.
    if (!isDuplicateKeyError(err)) throw err;
    return (await Settings.findOne({ key: 'store' }).lean<ISettings>())!;
  }
}

export interface SettingsPatch {
  shipping?: { flatRate?: number; freeShippingThreshold?: number | null };
  cod?: { enabled?: boolean; maxOrderValue?: number | null };
  maxQuantityPerLine?: number;
  returns?: { windowDays?: number };
}

export async function updateSettings(patch: SettingsPatch): Promise<ISettings> {
  await getSettings();
  const set: Record<string, unknown> = {};
  const put = (path: string, value: unknown) => value !== undefined && (set[path] = value);
  put('shipping.flatRate', patch.shipping?.flatRate);
  put('shipping.freeShippingThreshold', patch.shipping?.freeShippingThreshold);
  put('cod.enabled', patch.cod?.enabled);
  put('cod.maxOrderValue', patch.cod?.maxOrderValue);
  put('maxQuantityPerLine', patch.maxQuantityPerLine);
  put('returns.windowDays', patch.returns?.windowDays);
  await Settings.updateOne({ key: 'store' }, { $set: set });
  return getSettings();
}
